// ─────────────────────────────────────────────────────────────
// Caché GENÉRICA en BD con resiliencia, para fuentes frágiles (Yahoo:
// quotes, estimates…). Misma filosofía que avCache pero para cualquier
// fetcher async: si la fuente falla o el dato está caducado pero existe
// copia previa, se sirve esa copia marcada `stale` en vez de romper —
// ataca el riesgo nº1 (Yahoo no oficial → 502 cuando cae el crumb/límite).
//
// Reutiliza la tabla av_cache (kv genérico: cacheKey, data, fetchedAt).
// Devuelve { data, cached, stale, fetchedAt } — fetchedAt servirá luego
// para el badge "dato de hace X".
// ─────────────────────────────────────────────────────────────
import { getAvCache, saveAvCache } from './db.js';

export async function cached(key, ttl, fetcher, { force = false } = {}) {
  const prev = await getAvCache(key); // { data, fetchedAt } | null
  const age = prev?.fetchedAt ? Date.now() - Date.parse(prev.fetchedAt) : Infinity;
  if (!force && prev && age < ttl) {
    return { data: prev.data, cached: true, stale: false, fetchedAt: prev.fetchedAt };
  }
  try {
    const data = await fetcher();
    const fetchedAt = new Date().toISOString();
    await saveAvCache(key, data, fetchedAt);
    return { data, cached: false, stale: false, fetchedAt };
  } catch (e) {
    // Fuente caída → degradar a la última copia conocida si la hay.
    if (prev) return { data: prev.data, cached: true, stale: true, fetchedAt: prev.fetchedAt };
    throw e;
  }
}
