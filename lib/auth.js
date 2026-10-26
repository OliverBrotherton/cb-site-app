// Signed session tokens, so a phone stays unlocked after the PIN is entered once.
import crypto from 'node:crypto';

const b64 = buf => Buffer.from(buf).toString('base64url');
const DAYS_90 = 90 * 24 * 3600 * 1000;

export function signSession(payload, secret) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + DAYS_90 }));
  const sig = b64(crypto.createHmac('sha256', secret).update(body).digest());
  return body + '.' + sig;
}

export function readSession(token, secret) {
  if (!token || !secret) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const want = b64(crypto.createHmac('sha256', secret).update(body).digest());
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

export function randomToken(n = 24) {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...crypto.randomBytes(n)].map(x => a[x % a.length]).join('');
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
