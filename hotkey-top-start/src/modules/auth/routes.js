const env = require('../../config/env');
const { ok } = require('../../lib/http');

async function routes(fastify) {
  fastify.get('/bootstrap', async (request, reply) => {
    const user = request.auth.user;
    const modeOptions = [{ key: 'client', title: 'Заказать' }];
    if (user.courierProfile) modeOptions.push({ key: 'courier', title: 'К работе' });
    else modeOptions.push({ key: 'courier', title: 'К работе' });
    if (user.isSupport) modeOptions.push({ key: 'support', title: 'Саппорт' });
    if (user.isAdmin) modeOptions.push({ key: 'admin', title: 'Админка' });
    return ok(reply, {
      cityName: env.cityName,
      timezoneLabel: env.cityName,
      supportLink: `https://t.me/${env.supportUsername}`,
      modeOptions,
      user,
    });
  });
}

module.exports = routes;
