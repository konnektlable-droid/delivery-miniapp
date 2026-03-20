const path = require('path');
require('dotenv').config();

function csv(value) {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  cityName: process.env.CITY_NAME || 'Горячий Ключ',
  timezone: process.env.BUSINESS_TIMEZONE || 'Europe/Moscow',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  supportUsername: process.env.TELEGRAM_SUPPORT_USERNAME || 'hotkey_support',
  allowDevBypass: String(process.env.ALLOW_DEV_BYPASS || 'false') === 'true',
  adminTelegramIds: csv(process.env.ADMIN_TELEGRAM_IDS),
  supportTelegramIds: csv(process.env.SUPPORT_TELEGRAM_IDS),
  maxFileMb: Number(process.env.MAX_FILE_MB || 6),
  storageRoot: path.resolve(process.cwd(), 'storage'),
};
