// lib/auth.js
// Auth simple para el admin: HMAC con la propia ADMIN_PASSWORD como secret.
// El token tiene la forma: base64url(payload).hexsig
// Expira en 8 horas.

import crypto from 'node:crypto';

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

function getSecret() {
  const p = process.env.ADMIN_PASSWORD;
  if (!p) throw new Error('ADMIN_PASSWORD no esta seteada en env vars.');
  return p;
}

export function checkPassword(password) {
  if (!password) return false;
  const expected = getSecret();
  // comparacion timing-safe
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function signToken() {
  const payload = JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS });
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  const b64 = Buffer.from(payload).toString('base64url');
  return b64 + '.' + sig;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [b64, sig] = parts;
  let payload;
  try {
    payload = Buffer.from(b64, 'base64url').toString('utf-8');
  } catch { return false; }
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  if (expected.length !== sig.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  try {
    const obj = JSON.parse(payload);
    if (typeof obj.exp !== 'number' || Date.now() > obj.exp) return false;
    return true;
  } catch { return false; }
}

// Lee el token del header Authorization: Bearer <token>
export function tokenFromReq(req) {
  const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!auth || typeof auth !== 'string') return null;
  const m = auth.match(/^Bearer\s+(.+)$/);
  return m ? m[1] : null;
}
