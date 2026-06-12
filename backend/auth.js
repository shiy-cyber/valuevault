// ─────────────────────────────────────────────────────────────
// Autenticación sin dependencias externas (solo node:crypto):
//   · Contraseñas con scrypt + salt aleatorio (timing-safe al verificar).
//   · Sesión con JWT propio HS256 (HMAC-SHA256).
// Define JWT_SECRET en el entorno (Netlify) para producción real.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import { get, run } from './db.js';

const SECRET = process.env.JWT_SECRET || 'valuevault-dev-secret-change-me';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const b64url = (buf) => Buffer.from(buf).toString('base64url');

// ─── Contraseñas (scrypt) ───────────────────────────────────
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [saltHex, hashHex] = String(stored || '').split(':');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
}

// ─── JWT HS256 ──────────────────────────────────────────────
function signToken(payload, days = 30) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + days * 86400 }));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}
function verifyToken(token) {
  if (!token || token.split('.').length !== 3) return null;
  const [header, body, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest());
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ─── API de negocio ─────────────────────────────────────────
export async function registerUser(email, password) {
  email = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw Object.assign(new Error('Email no válido'), { status: 400 });
  if (String(password || '').length < 6) throw Object.assign(new Error('La contraseña debe tener al menos 6 caracteres'), { status: 400 });
  if (await get('SELECT id FROM users WHERE email = ?', [email])) {
    throw Object.assign(new Error('Ese email ya está registrado'), { status: 409 });
  }
  const info = await run('INSERT INTO users (email, passwordHash) VALUES (?, ?)', [email, hashPassword(password)]);
  const uid = Number(info.lastInsertRowid);
  return { token: signToken({ uid, email }), user: { id: uid, email } };
}

export async function loginUser(email, password) {
  email = String(email || '').trim().toLowerCase();
  const u = await get('SELECT * FROM users WHERE email = ?', [email]);
  if (!u || !verifyPassword(password, u.passwordHash)) {
    throw Object.assign(new Error('Email o contraseña incorrectos'), { status: 401 });
  }
  return { token: signToken({ uid: u.id, email: u.email }), user: { id: u.id, email: u.email } };
}

// Devuelve { uid, email } del token Bearer, o null si no hay/no es válido
export function userFromReq(req) {
  const auth = req.headers.authorization || '';
  return verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '');
}
