require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function ensureUser(telegramId, username, opts = {}) {
  return prisma.user.upsert({
    where: { telegramId: String(telegramId) },
    update: { ...opts, telegramUsername: username || undefined },
    create: {
      telegramId: String(telegramId),
      telegramUsername: username || undefined,
      firstName: opts.firstName || null,
      lastName: opts.lastName || null,
      isAdmin: !!opts.isAdmin,
      isSupport: !!opts.isSupport,
      wallet: { create: {} },
    },
  });
}

async function main() {
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const supportIds = (process.env.SUPPORT_TELEGRAM_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

  for (const id of adminIds) await ensureUser(id, null, { isAdmin: true, isSupport: true, firstName: 'Admin' });
  for (const id of supportIds) await ensureUser(id, null, { isSupport: true, firstName: 'Support' });

  await prisma.appSetting.upsert({
    where: { key: 'business_rules' },
    update: {
      value: {
        cityName: process.env.CITY_NAME || 'Горячий Ключ',
        timezone: process.env.BUSINESS_TIMEZONE || 'Europe/Moscow',
        dayMinGoodsTotal: 35000,
        nightMinGoodsTotal: 50000,
        nightFlatFeeUpTo1000: 39900,
        nightPercentAbove1000: 10,
        courierPayoutNightUpTo1000: 30000,
        courierPayoutNightAbove1000: 35000,
      },
      updatedByUserId: null,
    },
    create: {
      key: 'business_rules',
      value: {
        cityName: process.env.CITY_NAME || 'Горячий Ключ',
        timezone: process.env.BUSINESS_TIMEZONE || 'Europe/Moscow',
        dayMinGoodsTotal: 35000,
        nightMinGoodsTotal: 50000,
        nightFlatFeeUpTo1000: 39900,
        nightPercentAbove1000: 10,
        courierPayoutNightUpTo1000: 30000,
        courierPayoutNightAbove1000: 35000,
      },
    },
  });

  console.log('Seed complete');
}

main().finally(async () => {
  await prisma.$disconnect();
});
