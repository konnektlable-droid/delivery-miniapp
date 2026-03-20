const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function extFromMime(mime) {
  if (!mime) return '.bin';
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('webp')) return '.webp';
  return '.bin';
}

async function saveUpload(file, kind = 'misc') {
  const targetDir = path.join(env.storageRoot, kind);
  ensureDir(targetDir);
  const buf = await file.toBuffer();
  const limit = env.maxFileMb * 1024 * 1024;
  if (buf.length > limit) throw new Error(`Файл больше ${env.maxFileMb} MB`);
  const filename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${extFromMime(file.mimetype)}`;
  const abs = path.join(targetDir, filename);
  fs.writeFileSync(abs, buf);
  const rel = `/uploads/${kind}/${filename}`;
  return { rel, size: buf.length, mime: file.mimetype || 'application/octet-stream' };
}

module.exports = { saveUpload };
