const { prisma } = require('../../lib/prisma');
const { ok, fail } = require('../../lib/http');
const { courierPayoutFor } = require('../common/rules');
const { saveUpload } = require('../../lib/files');

function activeStatuses() {
  return ['CLAIMED', 'AT_STORE', 'COLLECTING', 'AWAITING_PAYMENT', 'NEEDS_APPROVAL', 'PAID', 'RECEIPT_UPLOADED', 'DELIVERING'];
}

async function routes(fastify) {
  fastify.post('/profile', async (request, reply) => {
    const body = request.body || {};
    if (!body.firstName?.trim() || !body.lastName?.trim() || !body.birthDate || !body.phone?.trim()) {
      return fail(reply, 400, 'Заполните имя, фамилию, дату рождения и телефон');
    }
    const transport = body.requestedTransport === 'BIKE' ? 'BIKE' : 'WALK';
    const user = await prisma.user.update({ where: { id: request.auth.user.id }, data: { firstName: body.firstName.trim(), lastName: body.lastName.trim(), phone: body.phone.trim() } });
    const profile = await prisma.courierProfile.upsert({
      where: { userId: user.id },
      update: { birthDate: new Date(body.birthDate), requestedTransport: transport, effectiveTransport: transport === 'BIKE' ? 'WALK' : 'WALK' },
      create: { userId: user.id, birthDate: new Date(body.birthDate), requestedTransport: transport, effectiveTransport: 'WALK' },
    });
    return ok(reply, { user, courierProfile: profile });
  });

  fastify.get('/me', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.auth.user.id },
      include: {
        courierProfile: true,
        courierOrders: { where: { status: { in: activeStatuses() } }, include: { items: true, attachments: true }, take: 1 },
      },
    });
    return ok(reply, user);
  });

  fastify.get('/orders', async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.auth.user.id }, include: { courierProfile: true } });
    if (!user.courierProfile) return fail(reply, 400, 'Сначала создайте профиль курьера');
    const orders = await prisma.order.findMany({
      where: { status: 'SEARCHING_COURIER' },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const items = orders.map((o) => ({ ...o, courierPayout: courierPayoutFor(o) }));
    return ok(reply, items);
  });

  fastify.post('/orders/:id/claim', async (request, reply) => {
    const userId = request.auth.user.id;
    const profile = await prisma.courierProfile.findUnique({ where: { userId } });
    if (!profile) return fail(reply, 400, 'Сначала создайте профиль курьера');
    if (request.auth.user.status !== 'ACTIVE') return fail(reply, 403, 'Аккаунт ограничен');

    try {
      const result = await prisma.$transaction(async (tx) => {
        const activeCount = await tx.order.count({ where: { courierUserId: userId, status: { in: activeStatuses() } } });
        if (activeCount > 0) throw new Error('У вас уже есть активный заказ');
        const current = await tx.order.findUnique({ where: { id: request.params.id } });
        if (!current) throw new Error('Заказ не найден');
        const payout = courierPayoutFor(current);
        const updated = await tx.order.updateMany({
          where: { id: request.params.id, courierUserId: null, status: 'SEARCHING_COURIER' },
          data: { courierUserId: userId, status: 'CLAIMED', courierPayout: payout, updatedAt: new Date() },
        });
        if (updated.count !== 1) throw new Error('Заказ уже взял другой курьер');
        const order = await tx.order.findUnique({ where: { id: request.params.id }, include: { items: true, attachments: true } });
        await tx.orderEvent.create({ data: { orderId: order.id, type: 'ORDER_CLAIMED', actorUserId: userId, fromStatus: 'SEARCHING_COURIER', toStatus: 'CLAIMED' } });
        return order;
      });
      return ok(reply, result);
    } catch (e) {
      return fail(reply, 409, e.message || 'Не удалось взять заказ');
    }
  });

  fastify.post('/orders/:id/step', async (request, reply) => {
    const body = request.body || {};
    const order = await prisma.order.findUnique({ where: { id: request.params.id }, include: { items: true } });
    if (!order || order.courierUserId !== request.auth.user.id) return fail(reply, 404, 'Заказ не найден');
    const map = {
      arrive_store: 'AT_STORE',
      collecting: 'COLLECTING',
      delivering: 'DELIVERING',
      delivered: 'DELIVERED',
      no_answer: 'PROBLEM',
      no_item: 'PROBLEM',
      amount_higher: 'NEEDS_APPROVAL',
    };
    const next = map[body.action];
    if (!next) return fail(reply, 400, 'Неизвестное действие');

    const data = { status: next };
    if (next === 'DELIVERED') data.deliveredAt = new Date();
    const updated = await prisma.order.update({ where: { id: order.id }, data });
    await prisma.orderEvent.create({ data: { orderId: order.id, type: body.action, actorUserId: request.auth.user.id, fromStatus: order.status, toStatus: next, payload: body.payload || {} } });
    return ok(reply, updated);
  });

  fastify.post('/orders/:id/upload-qr', async (request, reply) => {
    const order = await prisma.order.findUnique({ where: { id: request.params.id } });
    if (!order || order.courierUserId !== request.auth.user.id) return fail(reply, 404, 'Заказ не найден');
    const file = await request.file();
    if (!file) return fail(reply, 400, 'Нет файла');
    const saved = await saveUpload(file, 'qr');
    const attachment = await prisma.attachment.create({
      data: {
        orderId: order.id,
        type: 'PAYMENT_QR',
        storageKind: 'LOCAL',
        storageRef: saved.rel,
        mimeType: saved.mime,
        fileSize: saved.size,
        uploadedByUserId: request.auth.user.id,
        expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { paymentQrUploadedAt: new Date(), status: 'AWAITING_PAYMENT' } });
    return ok(reply, attachment);
  });

  fastify.post('/orders/:id/upload-receipt', async (request, reply) => {
    const order = await prisma.order.findUnique({ where: { id: request.params.id } });
    if (!order || order.courierUserId !== request.auth.user.id) return fail(reply, 404, 'Заказ не найден');
    const parts = await request.parts();
    let total = null;
    let filePart = null;
    for await (const part of parts) {
      if (part.type === 'file') filePart = part;
      if (part.type === 'field' && part.fieldname === 'receiptTotal') total = Number(part.value || 0);
    }
    if (!filePart) return fail(reply, 400, 'Нет файла');
    const saved = await saveUpload(filePart, 'receipts');
    const attachment = await prisma.attachment.create({
      data: {
        orderId: order.id,
        type: 'RECEIPT',
        storageKind: 'LOCAL',
        storageRef: saved.rel,
        mimeType: saved.mime,
        fileSize: saved.size,
        uploadedByUserId: request.auth.user.id,
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { receiptUploadedAt: new Date(), receiptTotal: total || order.estimatedGoodsTotal, status: 'RECEIPT_UPLOADED' } });
    return ok(reply, attachment);
  });
}

module.exports = routes;
