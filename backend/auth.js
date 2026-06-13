// ─────────────────────────────────────────────────────────────
// Autenticación sin dependencias externas (solo node:crypto):
//   · Contraseñas con scrypt + salt aleatorio (timing-safe al verificar).
//   · Sesión con JWT propio HS256 (HMAC-SHA256).
// Define JWT_SECRET en el entorno (Netlify) para producción real.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import { get, run } from './db.js';

// Secreto de firma JWT. Prioridad: variable de entorno (si está) → clave
// persistente auto-generada y guardada en la BD (privada). Así no depende
// del panel de Netlify y es fuerte y única sin pasos manuales.
let SECRET = process.env.JWT_SECRET || null;
export async function initAuthSecret() {
  if (SECRET) return;
  const row = await get("SELECT value FROM config WHERE key = 'jwt_secret'");
  if (row?.value) { SECRET = row.value; return; }
  const generated = crypto.randomBytes(48).toString('base64url');
  await run("INSERT OR IGNORE INTO config (key, value) VALUES ('jwt_secret', ?)", [generated]);
  const row2 = await get("SELECT value FROM config WHERE key = 'jwt_secret'"); // por si otra instancia ganó la carrera
  SECRET = row2?.value || generated;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const b64url = (buf) => Buffer.from(buf).toString('base64url');

// Código de recuperación: 16 chars de un alfabeto sin caracteres ambiguos
// (sin O/0/I/1), mostrado como XXXX-XXXX-XXXX-XXXX. Se guarda solo su hash.
const RC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRecoveryCode() {
  const bytes = crypto.randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += RC_ALPHABET[bytes[i] % RC_ALPHABET.length];
  return s.match(/.{1,4}/g).join('-');
}
const normCode = (c) => String(c || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

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
  const recoveryCode = generateRecoveryCode();
  const info = await run('INSERT INTO users (email, passwordHash, recoveryHash) VALUES (?, ?, ?)',
    [email, hashPassword(password), hashPassword(normCode(recoveryCode))]);
  const uid = Number(info.lastInsertRowid);
  return { token: signToken({ uid, email }), user: { id: uid, email }, recoveryCode };
}

// Restablece la contraseña con el código de recuperación; deja la sesión iniciada
export async function resetWithCode(email, code, newPassword) {
  email = String(email || '').trim().toLowerCase();
  if (String(newPassword || '').length < 6) throw Object.assign(new Error('La nueva contraseña debe tener al menos 6 caracteres'), { status: 400 });
  const u = await get('SELECT * FROM users WHERE email = ?', [email]);
  if (!u || !u.recoveryHash || !verifyPassword(normCode(code), u.recoveryHash)) {
    throw Object.assign(new Error('Email o código de recuperación incorrectos'), { status: 401 });
  }
  await run('UPDATE users SET passwordHash = ? WHERE id = ?', [hashPassword(newPassword), u.id]);
  return { token: signToken({ uid: u.id, email: u.email }), user: { id: u.id, email: u.email } };
}

// Genera un código nuevo (invalida el anterior) para un usuario con sesión
export async function regenerateRecovery(uid) {
  const recoveryCode = generateRecoveryCode();
  await run('UPDATE users SET recoveryHash = ? WHERE id = ?', [hashPassword(normCode(recoveryCode)), uid]);
  return { recoveryCode };
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
