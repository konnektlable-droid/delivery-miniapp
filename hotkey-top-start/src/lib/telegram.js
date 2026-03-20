const crypto = require('crypto');

function buildCheckString(params) {
  return [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function validateInitData(initData, botToken, maxAgeSec = 3600) {
  if (!initData || !botToken) return { ok: false, reason: 'missing_init_data_or_token' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'missing_hash' };

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate) return { ok: false, reason: 'missing_auth_date' };
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - authDate) > maxAgeSec) return { ok: false, reason: 'stale_auth_date' };

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const checkString = buildCheckString(params);
  const expected = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  if (expected !== hash) return { ok: false, reason: 'bad_hash' };

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    return { ok: false, reason: 'bad_user_json' };
  }

  return { ok: true, user, authDate };
}

module.exports = { validateInitData };
