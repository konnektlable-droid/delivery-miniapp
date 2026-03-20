const { prisma } = require('../lib/prisma');
const env = require('../config/env');
const { validateInitData } = require('../lib/telegram');
const { fail } = require('../lib/http');

async function upsertUserFromTelegram(tgUser) {
  const telegramId = String(tgUser.id);
  const isAdmin = env.adminTelegramIds.includes(telegramId);
  const isSupport = isAdmin || env.supportTelegramIds.includes(telegramId);

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {
      telegramUsername: tgUser.username || null,
      firstName: tgUser.first_name || null,
      lastName: tgUser.last_name || null,
      isAdmin,
      isSupport,
      lastSeenAt: new Date(),
    },
    create: {
      telegramId,
      telegramUsername: tgUser.username || null,
      firstName: tgUser.first_name || null,
      lastName: tgUser.last_name || null,
      isAdmin,
      isSupport,
      lastSeenAt: new Date(),
      wallet: { create: {} },
    },
    include: { wallet: true, courierProfile: true },
  });
  return user;
}

async function authGuard(request, reply) {
  const initData = request.headers['x-telegram-init-data'];
  if (initData) {
    const res = validateInitData(String(initData), env.telegramBotToken);
    if (!res.ok) return fail(reply, 401, 'Неверная Telegram авторизация', { reason: res.reason });
    request.auth = { kind: 'telegram', telegram: res.user, user: await upsertUserFromTelegram(res.user) };
    return;
  }

  if (env.allowDevBypass) {
    const devUser = request.query.devUser || request.headers['x-dev-user'];
    if (!devUser) return fail(reply, 401, 'Нет авторизации');
    const user = await upsertUserFromTelegram({
      id: String(devUser),
      username: String(request.query.username || request.headers['x-dev-username'] || `dev_${devUser}`),
      first_name: 'Dev',
      last_name: 'User',
    });
    request.auth = { kind: 'dev', telegram: { id: devUser }, user };
    return;
  }

  return fail(reply, 401, 'Нет авторизации');
}

function requireRole(...roles) {
  return async (request, reply) => {
    const user = request.auth?.user;
    if (!user) return fail(reply, 401, 'Нет авторизации');
    if (roles.includes('support') && user.isSupport) return;
    if (roles.includes('admin') && user.isAdmin) return;
    return fail(reply, 403, 'Недостаточно прав');
  };
}

module.exports = { authGuard, requireRole };
