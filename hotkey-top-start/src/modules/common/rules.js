const env = require('../../config/env');
const { isNightMode } = require('../../lib/time');

function calcOrderTotals(items, now = new Date()) {
  const estimatedGoodsTotal = items.reduce((sum, it) => sum + (Number(it.qty) * Number(it.unitEstimatedPrice)), 0);
  const night = isNightMode(now, env.timezone);
  let deliveryFee = 9900;
  if (night) {
    deliveryFee = estimatedGoodsTotal > 100000
      ? 39900 + Math.round(estimatedGoodsTotal * 0.10)
      : 39900;
  }
  const reserveBuffer = Math.max(3000, Math.round(estimatedGoodsTotal * 0.1));
  return {
    isNight: night,
    estimatedGoodsTotal,
    deliveryFee,
    reserveBuffer,
    reservedTotal: estimatedGoodsTotal + deliveryFee + reserveBuffer,
  };
}

function validateOrderPayload(payload) {
  const errors = [];
  if (!payload.storeName?.trim()) errors.push('Укажите название магазина');
  if (!payload.storeAddress?.trim()) errors.push('Укажите адрес магазина');
  if (!payload.deliveryAddress?.trim()) errors.push('Укажите адрес доставки');
  if (!Array.isArray(payload.items) || payload.items.length === 0) errors.push('Добавьте хотя бы один товар');
  for (const item of payload.items || []) {
    if (!item.name?.trim()) errors.push('У каждого товара должно быть название');
    if (!(Number(item.qty) > 0)) errors.push('Количество товара должно быть больше 0');
    if (!(Number(item.unitEstimatedPrice) > 0)) errors.push('Укажите цену за штуку');
  }
  return errors;
}

function minGoodsTotal(now = new Date()) {
  return isNightMode(now, env.timezone) ? 50000 : 35000;
}

function courierPayoutFor(order) {
  if (order.isNight) {
    return order.estimatedGoodsTotal > 100000 ? 35000 : 30000;
  }
  return 7000;
}

module.exports = { calcOrderTotals, validateOrderPayload, minGoodsTotal, courierPayoutFor };
