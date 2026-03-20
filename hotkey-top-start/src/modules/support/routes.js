const { prisma } = require('../../lib/prisma');
const { ok, fail } = require('../../lib/http');

async function logAction(actorUserId, type, orderId = null, targetUserId = null, beforeData = null, afterData = null, comment = null) {
  return prisma.supportAction.create({ data: { actorUserId, type, orderId, targetUserId, beforeData: beforeData || undefined, afterData: afterData || undefined, comment } });
}

async function routes(fastify) {
  fastify.get('/dashboard', async (request, reply) => {
    const [topups, orders, couriers, clients] = await Promise.all([
      prisma.topupRequest.findMany({ where: { status: 'PENDING' }, include: { user: true }, orderBy: { createdAt: 'asc' } }),
      prisma.order.findMany({ where: { status: { in: ['AWAITING_PAYMENT', 'NEEDS_APPROVAL', 'PROBLEM', 'RECEIPT_UPLOADED', 'SEARCHING_COURIER'] } }, include: { clientUser: true, courierUser: true, items: true, attachments: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.user.findMany({ where: { courierProfile: { isNot: null } }, include: { courierProfile: true }, orderBy: { createdAt: 'desc' } }),
      prisma.user.findMany({ include: { wallet: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return ok(reply, { topups, orders, couriers, clients });
  });

  fastify.post('/topups/:id/confirm', async (request, reply) => {
    const topup = await prisma.topupRequest.findUnique({ where: { id: request.params.id }, include: { user: { include: { wallet: true } } } });
    if (!topup || topup.status !== 'PENDING') return fail(reply, 404, 'Заявка не найдена');
    const data = await prisma.$transaction(async (tx) => {
      await tx.topupRequest.update({ where: { id: topup.id }, data: { status: 'CONFIRMED', processedById: request.auth.user.id, processedAt: new Date() } });
      await tx.wallet.update({ where: { userId: topup.userId }, data: { balance: { increment: topup.amount } } });
      const wallet = await tx.wallet.findUnique({ where: { userId: topup.userId } });
      await tx.walletTransaction.create({ data: { walletId: wallet.id, type: 'TOPUP_CONFIRMED', direction: 'CREDIT', amount: topup.amount, topupRequestId: topup.id, comment: 'Пополнение подтверждено саппортом' } });
      return { id: topup.id, status: 'CONFIRMED' };
    });
    await logAction(request.auth.user.id, 'CONFIRM_TOPUP', null, topup.userId, { status: 'PENDING' }, { status: 'CONFIRMED' });
    return ok(reply, data);
  });

  fastify.post('/topups/:id/reject', async (request, reply) => {
    const topup = await prisma.topupRequest.findUnique({ where: { id: request.params.id } });
    if (!topup || topup.status !== 'PENDING') return fail(reply, 404, 'Заявка не найдена');
    await prisma.topupRequest.update({ where: { id: topup.id }, data: { status: 'REJECTED', processedById: request.auth.user.id, processedAt: new Date() } });
    await logAction(request.auth.user.id, 'REJECT_TOPUP', null, topup.userId, { status: 'PENDING' }, { status: 'REJECTED' });
    return ok(reply, { id: topup.id, status: 'REJECTED' });
  });

  fastify.post('/orders/:id/action', async (request, reply) => {
    const body = request.body || {};
    const order = await prisma.order.findUnique({ where: { id: request.params.id }, include: { items: true, clientUser: true, courierUser: true } });
    if (!order) return fail(reply, 404, 'Заказ не найден');

    if (body.action === 'confirm_payment') {
      if (!order.paymentQrUploadedAt) return fail(reply, 400, 'QR ещё не загружен');
      const updated = await prisma.order.update({ where: { id: order.id }, data: { status: 'PAID', paymentConfirmedAt: new Date() } });
      await prisma.orderEvent.create({ data: { orderId: order.id, type: 'PAYMENT_CONFIRMED', actorUserId: request.auth.user.id, fromStatus: order.status, toStatus: 'PAID' } });
      await logAction(request.auth.user.id, 'CONFIRM_PAYMENT', order.id, null, { status: order.status }, { status: 'PAID' });
      return ok(reply, updated);
    }

    if (body.action === 'edit_items') {
      if (!Array.isArray(body.items)) return fail(reply, 400, 'Нужен массив items');
      const updates = [];
      for (const patch of body.items) {
        const item = order.items.find((x) => x.id === patch.id);
        if (!item) continue;
        updates.push(prisma.orderItem.update({ where: { id: item.id }, data: {
          actualQty: patch.actualQty ?? item.qty,
          actualUnitPrice: patch.actualUnitPrice ?? item.unitEstimatedPrice,
          actualLineTotal: (patch.actualQty ?? item.qty) * (patch.actualUnitPrice ?? item.unitEstimatedPrice),
          itemStatus: patch.itemStatus || item.itemStatus,
        }}));
      }
      if (updates.length) await prisma.$transaction(updates);
      await prisma.order.update({ where: { id: order.id }, data: { status: 'NEEDS_APPROVAL' } });
      await logAction(request.auth.user.id, 'EDIT_ORDER_ITEMS', order.id, order.clientUserId, null, body.items);
      return ok(reply, { status: 'NEEDS_APPROVAL' });
    }

    if (body.action === 'manual_assign') {
      const courierUserId = String(body.courierUserId || '');
      const courier = await prisma.user.findUnique({ where: { id: courierUserId }, include: { courierProfile: true } });
      if (!courier || !courier.courierProfile) return fail(reply, 400, 'Курьер не найден');
      await prisma.order.update({ where: { id: order.id }, data: { courierUserId, status: 'CLAIMED', manualAssigned: true, manualAssignmentReason: body.reason || 'support override' } });
      await logAction(request.auth.user.id, 'MANUAL_ASSIGN_ORDER', order.id, courierUserId, null, { reason: body.reason || null });
      return ok(reply, { status: 'CLAIMED' });
    }

    return fail(reply, 400, 'Неизвестное действие');
  });

  fastify.post('/users/:id/status', async (request, reply) => {
    const body = request.body || {};
    const user = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!user) return fail(reply, 404, 'Пользователь не найден');
    let next = 'ACTIVE';
    if (body.action === 'freeze') next = 'FROZEN';
    if (body.action === 'block') next = 'BLOCKED';
    if (body.action === 'unfreeze' || body.action === 'unblock') next = 'ACTIVE';
    const updated = await prisma.user.update({ where: { id: user.id }, data: { status: next } });
    await logAction(request.auth.user.id, body.action?.toUpperCase() || 'STATUS_CHANGE', null, user.id, { status: user.status }, { status: next }, body.reason || null);
    return ok(reply, updated);
  });

  fastify.post('/couriers/:id/action', async (request, reply) => {
    const body = request.body || {};
    const profile = await prisma.courierProfile.findUnique({ where: { userId: request.params.id } });
    if (!profile) return fail(reply, 404, 'Профиль курьера не найден');
    let data = {};
    if (body.action === 'verify_profile') data.profileVerified = true;
    else if (body.action === 'verify_bike') data.bikeVerified = true, data.effectiveTransport = 'BIKE';
    else if (body.action === 'set_trust') data.trustLevel = body.trustLevel || 'BASIC', data.trustNote = body.note || null;
    else return fail(reply, 400, 'Неизвестное действие');
    const updated = await prisma.courierProfile.update({ where: { userId: request.params.id }, data });
    await logAction(request.auth.user.id, body.action.toUpperCase(), null, request.params.id, null, data, body.note || null);
    return ok(reply, updated);
  });
}

module.exports = routes;
