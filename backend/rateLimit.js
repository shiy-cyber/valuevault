// ─────────────────────────────────────────────────────────────
// Limitador de intentos respaldado en BD (Turso) — NO en memoria.
// Netlify Functions puede crear una instancia de Node nueva en cada
// invocación, así que un contador `let attempts = {}` de módulo no protege
// nada en producción. Igual que el anti-spam de posts/comentarios
// (comprobación contra `created_at` en BD), esto se comprueba contra una
// fila persistente en la tabla `rate_limits` — funciona igual da igual
// qué instancia sirva la siguiente petición.
//
// Uso típico (ver auth/login en app.js):
//   const g = await checkRateLimit(key);
//   if (g.blocked) throw ...429...
//   ... intento ...
//   si fallo → await registerAttempt(key, LIMIT)
//   si éxito → await clearRateLimit(key)
// ─────────────────────────────────────────────────────────────
import { get, run } from './db.js';

// Presets reutilizables por endpoint.
export const LOGIN_LIMIT   = { windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000, maxAttempts: 5 };
// "forgot" no tiene éxito/fallo — cada petición cuenta como intento, para
// limitar cuántos emails de recuperación puede disparar la misma clave.
export const FORGOT_LIMIT  = { windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000, maxAttempts: 3 };
export const REGISTER_LIMIT = { windowMs: 60 * 60 * 1000, blockMs: 30 * 60 * 1000, maxAttempts: 8 };

// IP real del cliente. Netlify Functions va detrás de su propio proxy, así
// que (a diferencia de una app en LAN sin proxy) SÍ es correcto fiarse de
// estas cabeceras: las pone la plataforma, no el cliente directamente.
export function clientIp(req) {
  const nf = req.headers['x-nf-client-connection-ip'];
  if (nf) return String(nf).trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'desconocida';
}

// ¿Está bloqueada esta clave ahora mismo? No consume intento.
export async function checkRateLimit(key) {
  const row = await get('SELECT blockedUntil FROM rate_limits WHERE rkey = ?', [String(key)]);
  const until = row?.blockedUntil ? Date.parse(row.blockedUntil) : 0;
  if (until > Date.now()) {
    return { blocked: true, secondsLeft: Math.ceil((until - Date.now()) / 1000) };
  }
  return { blocked: false, secondsLeft: 0 };
}

// Registra un intento (fallo de login, o cualquier petición en el caso de
// "forgot"). Si se alcanza el máximo dentro de la ventana, activa el bloqueo.
export async function registerAttempt(key, { windowMs, blockMs, maxAttempts }) {
  const now = Date.now();
  const row = await get('SELECT attempts, windowStart FROM rate_limits WHERE rkey = ?', [String(key)]);
  let attempts = 1;
  let windowStart = new Date(now).toISOString();
  if (row?.windowStart && now - Date.parse(row.windowStart) < windowMs) {
    attempts = Number(row.attempts || 0) + 1;
    windowStart = row.windowStart;
  }
  const blockedUntil = attempts >= maxAttempts ? new Date(now + blockMs).toISOString() : null;
  await run(
    `INSERT INTO rate_limits (rkey, attempts, windowStart, blockedUntil) VALUES (?, ?, ?, ?)
     ON CONFLICT(rkey) DO UPDATE SET attempts = excluded.attempts, windowStart = excluded.windowStart, blockedUntil = excluded.blockedUntil`,
    [String(key), attempts, windowStart, blockedUntil]
  );
  return { attempts, blocked: !!blockedUntil };
}

// Intento CORRECTO: limpia el historial (login con éxito).
export async function clearRateLimit(key) {
  await run('DELETE FROM rate_limits WHERE rkey = ?', [String(key)]);
}
