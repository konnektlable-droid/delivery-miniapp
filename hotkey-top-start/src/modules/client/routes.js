const { prisma } = require('../../lib/prisma');
const { ok, fail, orderNumber } = require('../../lib/http');
const { calcOrderTotals, validateOrderPayload, minGoodsTotal } = require('../common/rules');

async function routes(fastify) {
  fastify.get('/me', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.auth.user.id },
      include: {
        wallet: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } },
        clientOrders: { orderBy: { createdAt: 'desc' }, take: 20, include: { items: true, attachments: true } },
      },
    });
    return ok(reply, user);
  });

  fastify.post('/orders', async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.auth.user.id }, include: { wallet: true } });
    if (user.status !== 'ACTIVE') return fail(reply, 403, 'Аккаунт ограничен');
    const payload = request.body || {};
    const errors = validateOrderPayload(payload);
    if (errors.length) return fail(reply, 400, errors.join('. '));

    const totals = calcOrderTotals(payload.items);
    if (totals.estimatedGoodsTotal < minGoodsTotal()) {
      return fail(reply, 400, totals.isNight ? 'Ночью минимальная сумма товаров — 500 ₽' : 'Днём минимальная сумма товаров — 350 ₽');
    }
    const available = (user.wallet?.balance || 0) - (user.wallet?.reservedBalance || 0);
    if (available < totals.reservedTotal) return fail(reply, 400, 'Недостаточно средств на балансе');

    const created = await prisma.$transaction(async (tx) => {
      const freshWallet = await tx.wallet.findUnique({ where: { userId: user.id } });
      const freshAvailable = freshWallet.balance - freshWallet.reservedBalance;
      if (freshAvailable < totals.reservedTotal) throw new Error('Недостаточно средств на балансе');

      await tx.wallet.update({
        where: { userId: user.id },
        data: { reservedBalance: { increment: totals.reservedTotal } },
      });

      const order = await tx.order.create({
        data: {
          orderNumber: orderNumber(),
          clientUserId: user.id,
          status: 'SEARCHING_COURIER',
          storeName: payload.storeName.trim(),
          storeAddress: payload.storeAddress.trim(),
          deliveryAddress: payload.deliveryAddress.trim(),
          deliveryComment: payload.deliveryComment?.trim() || null,
          replacementsMode: payload.replacementsMode || 'SIMILAR_ONLY',
          estimatedGoodsTotal: totals.estimatedGoodsTotal,
          deliveryFee: totals.deliveryFee,
          reserveBuffer: totals.reserveBuffer,
          reservedTotal: totals.reservedTotal,
          isNight: totals.isNight,
          items: {
            create: payload.items.map((it) => ({
              name: it.name.trim(),
              qty: Number(it.qty),
              unitEstimatedPrice: Number(it.unitEstimatedPrice),
              lineEstimatedTotal: Number(it.qty) * Number(it.unitEstimatedPrice),
            })),
          },
          events: { create: { type: 'ORDER_CREATED', toStatus: 'SEARCHING_COURIER', actorUserId: user.id } },
          walletTxs: { create: { walletId: freshWallet.id, type: 'ORDER_RESERVE', direction: 'DEBIT', amount: totals.reservedTotal, comment: 'Резерв по заказу' } },
        },
        include: { items: true },
      });
      return order;
    });

    return ok(reply, created);
  });

  fastify.post('/topups/request', async (request, reply) => {
    const payload = request.body || {};
    const amount = Number(payload.amount || 0);
    if (amount <= 0) return fail(reply, 400, 'Укажите сумму пополнения');
    const reqTopup = await prisma.topupRequest.create({
      data: {
        userId: request.auth.user.id,
        amount,
        payerPhone: payload.payerPhone?.trim() || null,
        comment: payload.comment?.trim() || null,
      },
    });
    return ok(reply, reqTopup);
  });

  fastify.post('/orders/:id/approval', async (request, reply) => {
    const payload = request.body || {};
    const order = await prisma.order.findUnique({ where: { id: request.params.id }, include: { items: true } });
    if (!order || order.clientUserId !== request.auth.user.id) return fail(reply, 404, 'Заказ не найден');
    if (order.status !== 'NEEDS_APPROVAL') return fail(reply, 400, 'Заказ не ждёт согласования');

    if (payload.decision === 'cancel') {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      return ok(reply, { status: 'CANCELLED' });
    }

    const sum = order.items.filter(i => i.itemStatus !== 'removed').reduce((s, i) => s + (i.actualLineTotal || i.lineEstimatedTotal), 0);
    await prisma.order.update({
      where: { id: order.id },
      data: { estimatedGoodsTotal: sum, status: 'AWAITING_PAYMENT', events: { create: { type: 'CLIENT_APPROVED', actorUserId: request.auth.user.id, toStatus: 'AWAITING_PAYMENT' } } },
    });
    return ok(reply, { status: 'AWAITING_PAYMENT' });
  });
}

module.exports = routes;
