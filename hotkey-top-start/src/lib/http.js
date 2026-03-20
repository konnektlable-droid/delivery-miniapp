function ok(reply, data = {}) { return reply.code(200).send({ ok: true, data }); }
function fail(reply, code, message, extra = {}) { return reply.code(code).send({ ok: false, error: message, ...extra }); }
function toRub(cents) { return (cents / 100).toFixed(2); }
function orderNumber() { return `N${Date.now().toString().slice(-8)}`; }
module.exports = { ok, fail, toRub, orderNumber };
