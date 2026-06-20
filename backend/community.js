// ─────────────────────────────────────────────────────────────
// Comunidad social — utilidades de servidor.
// Fase 0: validación de la identidad pública (alias).
// (Fases posteriores añadirán aquí parsers de $TICKER/@handle y notify().)
// ─────────────────────────────────────────────────────────────

// Alias reservados (no se pueden registrar como handle público).
export const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'valuevault', 'demo', 'support', 'soporte',
  'me', 'null', 'undefined', 'root', 'api', 'community', 'comunidad',
]);

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;       // minúsculas, números y guion bajo
const CONTROL_RE = /[\x00-\x1f\x7f]/;        // caracteres de control (no imprimibles)

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

export const normalizeHandle = (h) => String(h || '').trim().toLowerCase();

// Valida y normaliza el cuerpo del perfil. Lanza Error{status:400} si algo
// no cumple. Devuelve { displayName, handle, avatar, bio } listos para guardar.
export function validateProfileInput(b = {}) {
  const displayName = String(b.displayName || '').trim();
  if (displayName.length < 2 || displayName.length > 30) {
    throw bad('El nombre debe tener entre 2 y 30 caracteres');
  }
  if (CONTROL_RE.test(displayName)) throw bad('El nombre contiene caracteres no válidos');

  const handle = normalizeHandle(b.handle);
  if (!HANDLE_RE.test(handle)) {
    throw bad('El alias debe tener 3–20 caracteres: solo minúsculas, números o _');
  }
  if (RESERVED_HANDLES.has(handle)) throw bad('Ese alias está reservado');

  const avatar = String(b.avatar || '').trim().slice(0, 8) || null; // un emoji corto
  const bio = String(b.bio || '').trim().slice(0, 160) || null;

  return { displayName, handle, avatar, bio };
}
