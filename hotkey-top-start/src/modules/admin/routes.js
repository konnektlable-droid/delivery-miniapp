const { prisma } = require('../../lib/prisma');
const { ok, fail } = require('../../lib/http');

async function routes(fastify) {
  fastify.post('/users/:id/roles', async (request, reply) => {
    const body = request.body || {};
    const user = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!user) return fail(reply, 404, 'Пользователь не найден');
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        isSupport: !!body.isSupport,
        isAdmin: !!body.isAdmin,
      },
    });
    return ok(reply, updated);
  });
}

module.exports = routes;
