const path = require('path');
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const rateLimit = require('@fastify/rate-limit');
const fastifyStatic = require('@fastify/static');
const env = require('./config/env');
const { authGuard, requireRole } = require('./middleware/auth');
const authRoutes = require('./modules/auth/routes');
const clientRoutes = require('./modules/client/routes');
const courierRoutes = require('./modules/courier/routes');
const supportRoutes = require('./modules/support/routes');
const adminRoutes = require('./modules/admin/routes');

const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

app.register(cors, { origin: true, credentials: true });
app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
app.register(multipart, { attachFieldsToBody: false, limits: { fileSize: env.maxFileMb * 1024 * 1024 } });
app.register(fastifyStatic, { root: path.join(process.cwd(), 'public'), prefix: '/', decorateReply: false });
app.register(fastifyStatic, { root: path.join(process.cwd(), 'storage'), prefix: '/uploads/', decorateReply: false });

app.get('/health', async () => ({ ok: true, city: env.cityName }));

app.register(async function apiScope(instance) {
  instance.addHook('preHandler', authGuard);
  instance.register(authRoutes, { prefix: '/api' });
  instance.register(clientRoutes, { prefix: '/api/client' });
  instance.register(courierRoutes, { prefix: '/api/courier' });
  instance.register(async function supportScope(i) {
    i.addHook('preHandler', requireRole('support', 'admin'));
    i.register(supportRoutes, { prefix: '/api/support' });
  });
  instance.register(async function adminScope(i) {
    i.addHook('preHandler', requireRole('admin'));
    i.register(adminRoutes, { prefix: '/api/admin' });
  });
});

app.setErrorHandler((err, request, reply) => {
  request.log.error(err);
  reply.code(err.statusCode || 500).send({ ok: false, error: err.message || 'Внутренняя ошибка' });
});

app.listen({ port: env.port, host: env.host }).then(() => {
  app.log.info(`HotKey delivery app started on ${env.host}:${env.port}`);
});
