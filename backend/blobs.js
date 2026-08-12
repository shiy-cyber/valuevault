// ─────────────────────────────────────────────────────────────
// Almacenamiento de ficheros binarios (PDFs de tesis), con 2 modos:
//   · Netlify → @netlify/blobs (si corre en Netlify)
//   · Local   → tabla `blobs` en la misma BD (dev / Turso sin Netlify)
// La tabla `theses` solo guarda la CLAVE (blobKey); los bytes viven aquí.
// ─────────────────────────────────────────────────────────────
import { get, run } from './db.js';

const useNetlify = !!process.env.NETLIFY || !!process.env.NETLIFY_BLOBS_CONTEXT;
const STORE_NAME = 'valuevault-theses';

let _store;
async function netlifyStore() {
  if (!_store) {
    const { getStore } = await import('@netlify/blobs');
    _store = getStore(STORE_NAME);
  }
  return _store;
}

// Guarda los bytes (Buffer) bajo `key`. Devuelve la clave.
export async function saveBlob(key, buffer) {
  if (useNetlify) {
    const store = await netlifyStore();
    await store.set(key, buffer);
  } else {
    await run('INSERT OR REPLACE INTO blobs (key, data) VALUES (?, ?)', [key, buffer.toString('base64')]);
  }
  return key;
}

// Recupera los bytes de `key` como Buffer, o null si no existe.
export async function getBlob(key) {
  if (useNetlify) {
    const store = await netlifyStore();
    const ab = await store.get(key, { type: 'arrayBuffer' });
    return ab ? Buffer.from(ab) : null;
  }
  const row = await get('SELECT data FROM blobs WHERE key = ?', [key]);
  return row ? Buffer.from(row.data, 'base64') : null;
}

// Borra un blob (best-effort; no falla si no existe).
export async function deleteBlob(key) {
  try {
    if (useNetlify) {
      const store = await netlifyStore();
      await store.delete(key);
    } else {
      await run('DELETE FROM blobs WHERE key = ?', [key]);
    }
  } catch { /* noop */ }
}

export const thesisKey = (id) => `thesis_${id}`;
