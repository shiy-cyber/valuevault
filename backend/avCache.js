// ─────────────────────────────────────────────────────────────
// Capa de caché GLOBAL delante de Alpha Vantage. Una sola petición
// por (función, ticker) sirve para toda la app y se reutiliza hasta
// que caduca su TTL — así la cuota gratuita (~25 req/día, compartida)
// no se malgasta repitiendo el mismo dato entre usuarios/recargas.
//
// TTL por tipo de dato (cada cosa cambia a su ritmo):
//   · GLOBAL_QUOTE → 12 h (precio; para una app de valor basta intradía).
//   · OVERVIEW     → 24 h (ratios fundamentales, cambian poco).
//   · Estados financieros y demás (CASH_FLOW, INCOME_STATEMENT,
//     BALANCE_SHEET, EARNINGS, DIVIDENDS…) → 7 días (publicación trimestral).
//
// Resiliencia: si AV agota cuota o falla la red y existe una copia previa
// (aunque esté caducada), se devuelve esa copia marcada como `stale` en vez
// de romper. Solo se lanza error si NO hay ninguna copia.
//
// La clave (ALPHA_VANTAGE_KEY) nunca sale del servidor.
// ─────────────────────────────────────────────────────────────
import { getAvCache, saveAvCache } from './db.js';

const KEY = process.env.ALPHA_VANTAGE_KEY;
const BASE = 'https://www.alphavantage.co/query';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const HOUR = 60 * 60 * 1000;
const TTL = { GLOBAL_QUOTE: 12 * HOUR, OVERVIEW: 24 * HOUR };
const STATEMENTS_TTL = 7 * 24 * HOUR; // por defecto: estados financieros / informes
const ttlFor = (fn) => TTL[fn] ?? STATEMENTS_TTL;

const isLimit = (j) => !!(j && (j.Note || j.Information));

// Throttle global entre peticiones EN VIVO (no entre aciertos de caché): la
// clave gratuita admite pocas req/min. Las llamadas servidas desde caché no
// tocan esto, así que reabrir un valor cacheado es instantáneo.
let lastLive = 0;
async function throttle() {
  const wait = 1200 - (Date.now() - lastLive);
  if (wait > 0) await sleep(wait);
  lastLive = Date.now();
}

// Devuelve { data, cached, stale } con la respuesta de Alpha Vantage.
//   data  : objeto JSON (endpoints normales) o texto crudo (CSV, p.ej.
//           EARNINGS_CALENDAR) — el llamador sabe qué esperar por el `fn`.
//   cached: servido desde BD sin llamar a AV.
//   stale : copia previa devuelta por fallback (cuota agotada o red caída).
//   opts.extra: sufijo de query extra (p.ej. '&horizon=3month'); forma parte
//               de la clave de caché para no colisionar entre variantes.
export async function avQuery(fn, symbol, { force = false, timeout = 9000, extra = '' } = {}) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) throw Object.assign(new Error('Ticker vacío'), { status: 400 });
  const key = `${fn}:${sym}${extra}`;

  const cached = await getAvCache(key); // { data, fetchedAt } | null
  const age = cached?.fetchedAt ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
  if (!force && cached && age < ttlFor(fn)) {
    return { data: cached.data, cached: true, stale: false };
  }

  try {
    await throttle();
    const r = await fetch(`${BASE}?function=${fn}&symbol=${encodeURIComponent(sym)}${extra}&apikey=${KEY}`,
      { signal: AbortSignal.timeout(timeout) });
    const text = await r.text();
    const head = text.trimStart(); // trimStart() ya descarta un BOM (U+FEFF) inicial
    // AV devuelve JSON {Note|Information} para avisos de cuota INCLUSO en
    // endpoints CSV → si empieza por '{' lo tratamos como JSON.
    if (head.startsWith('{')) {
      const j = JSON.parse(text);
      if (isLimit(j)) {
        if (cached) return { data: cached.data, cached: true, stale: true };
        throw Object.assign(new Error(j.Note || j.Information || 'Límite de Alpha Vantage alcanzado (≈25/día).'), { status: 429, limited: true });
      }
      await saveAvCache(key, j, new Date().toISOString());
      return { data: j, cached: false, stale: false };
    }
    // Respuesta no-JSON (CSV) → texto crudo; lo parsea el módulo llamador.
    await saveAvCache(key, text, new Date().toISOString());
    return { data: text, cached: false, stale: false };
  } catch (e) {
    // Red/timeout/cuota sin copia previa → degradar a caché si la hay.
    if (cached) return { data: cached.data, cached: true, stale: true };
    throw e;
  }
}
