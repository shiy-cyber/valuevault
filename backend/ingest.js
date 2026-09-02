// ─────────────────────────────────────────────────────────────
// Ingesta programada (patrón cron → BD). PROTOTIPO: cotizaciones.
// El cron llama a estas funciones; trae el dato de la fuente UNA vez y lo
// deja normalizado en Turso. La API de la app luego LEE de la tabla `quotes`
// (nunca hace fetch en vivo en la petición del usuario).
//   · Última copia buena: si un símbolo falla, NO se sobreescribe su fila.
//   · Monitorización: ping opcional a HEALTHCHECK_URL (dead-man switch).
// ─────────────────────────────────────────────────────────────
import { all, run, get } from './db.js';

// Autoriza una invocación de las funciones programadas de Netlify
// (netlify/functions/ingest.js, ingest-daily.js): pasan si Netlify las llamó
// de verdad como cron (cabecera `x-nf-event: schedule`, documentada por
// Netlify) O si se llama a mano con el mismo secreto que ya protege
// /api/admin/ingest (`x-ingest-secret`) — así el disparo manual de
// mantenimiento sigue funcionando aunque el scheduler nativo esté caído.
// Sin INGEST_SECRET definida, el secreto no bloquea nada (igual que en
// /api/admin/ingest) — pero el cron real de Netlify sigue pasando igual.
export function isAuthorizedCron(event) {
  const headers = event?.headers || {};
  if ((headers['x-nf-event'] || headers['X-NF-Event']) === 'schedule') return true;
  const secret = process.env.INGEST_SECRET;
  if (!secret) return true;
  return (headers['x-ingest-secret'] || headers['X-Ingest-Secret']) === secret;
}
import { getQuotes } from './sectors.js';
import { getFundamentals } from './valuation.js';
import { ingestMemoryPrices } from './memory.js';

// Universo ACTIVO: solo los tickers que algún usuario tiene en cartera/watchlist.
// Acota coste/cuota: no se trae "todo el mercado", solo lo que se usa.
async function activeUniverse() {
  const rows = await all("SELECT DISTINCT ticker FROM assets WHERE ticker IS NOT NULL AND ticker != ''");
  return rows.map(r => r.ticker);
}

// Sin argumento → universo activo completo (lo llama el cron).
// Con `only` (array de tickers) → solo esos (lo llama el refresco manual de un usuario).
export async function ingestQuotes(only = null) {
  const startedAt = new Date().toISOString();
  const tickers = (Array.isArray(only) && only.length) ? [...new Set(only)] : await activeUniverse();
  if (!tickers.length) return summarize({ startedAt, total: 0, updated: 0, failed: 0, errors: [] });

  const quotes = await getQuotes(tickers, true); // fuerza fetch fresco (es el cron quien paga la latencia)
  const now = new Date().toISOString();
  let updated = 0, failed = 0; const errors = [];

  for (const q of quotes) {
    if (q.price == null) {
      // ÚLTIMA COPIA BUENA: no tocamos la fila; se conserva el dato anterior.
      failed++;
      if (q.error) errors.push(`${q.symbol}: ${q.error}`);
      continue;
    }
    await run(
      `INSERT INTO quotes (ticker, price, currency, changePct, payload, fetchedAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticker) DO UPDATE SET
         price=excluded.price, currency=excluded.currency,
         changePct=excluded.changePct, payload=excluded.payload, fetchedAt=excluded.fetchedAt`,
      [q.symbol, q.price, q.currency ?? null, q.changePercent ?? q.changePct ?? null, JSON.stringify(q), now]
    );
    updated++;
  }

  const s = summarize({ startedAt, total: tickers.length, updated, failed, errors });
  await pingMonitor(s).catch(() => {});
  console.log(`📥 ingestQuotes: ${updated}/${tickers.length} ok · ${failed} fallidos`);
  return s;
}

function summarize({ startedAt, total, updated, failed, errors }) {
  return { ok: failed === 0, total, updated, failed, errors: errors.slice(0, 20), startedAt, finishedAt: new Date().toISOString() };
}

// ─── Fundamentales (Alpha Vantage, CUOTA 25/día) ─────────────────────────
// Presupuesto por corrida + solo refresca los ausentes/viejos → respeta la
// cuota aunque el cron corra a menudo. Pensado para un cron DIARIO.
const FUND_BUDGET = 20;                 // máx. tickers por corrida
const FUND_TTL_MS = 20 * 3600 * 1000;   // refresca si tiene > 20 h

export async function ingestFundamentals(only = null) {
  const startedAt = new Date().toISOString();
  const universe = (Array.isArray(only) && only.length) ? [...new Set(only)] : await activeUniverse();
  const cacheRows = await all('SELECT ticker, fetchedAt FROM fundamentals_cache');
  const cachedAt = Object.fromEntries(cacheRows.map(r => [r.ticker, new Date(r.fetchedAt).getTime()]));
  const cutoff = Date.now() - FUND_TTL_MS;
  const due = universe
    .filter(t => !(cachedAt[String(t).toUpperCase()] >= cutoff))                                  // ausente o viejo
    .sort((a, b) => (cachedAt[String(a).toUpperCase()] || 0) - (cachedAt[String(b).toUpperCase()] || 0)) // más viejos primero
    .slice(0, FUND_BUDGET);

  let updated = 0, failed = 0; const errors = [];
  for (const t of due) {
    try {
      const data = await getFundamentals(t);
      await run('INSERT OR REPLACE INTO fundamentals_cache (ticker, data, fetchedAt) VALUES (?, ?, ?)',
        [String(t).toUpperCase(), JSON.stringify(data), new Date().toISOString()]);
      updated++;
    } catch (e) { failed++; errors.push(`${t}: ${e.message}`); } // última copia buena
  }
  const s = summarize({ startedAt, total: due.length, updated, failed, errors });
  await pingMonitor(s).catch(() => {});
  console.log(`📥 ingestFundamentals: ${updated}/${due.length} ok (universo ${universe.length}, presupuesto ${FUND_BUDGET})`);
  return s;
}

// Lectura de fundamentales con caché → evita gastar cuota AV en cada clic.
export async function cachedFundamentals(ticker) {
  const t = String(ticker).toUpperCase();
  const row = await get('SELECT data, fetchedAt FROM fundamentals_cache WHERE ticker = ?', [t]);
  if (row && Date.now() - new Date(row.fetchedAt).getTime() < FUND_TTL_MS) {
    try { return { ...JSON.parse(row.data), _fetchedAt: row.fetchedAt, _cached: true }; } catch { /* cae a fetch */ }
  }
  const data = await getFundamentals(ticker);
  await run('INSERT OR REPLACE INTO fundamentals_cache (ticker, data, fetchedAt) VALUES (?, ?, ?)',
    [t, JSON.stringify(data), new Date().toISOString()]);
  return { ...data, _cached: false };
}

// ─── Precios de memoria (DRAM/NAND/HBM) ──────────────────────────────────
// Diario (una fila nueva por producto y día en memory_price_history).
export async function ingestMemory() {
  const startedAt = new Date().toISOString();
  try {
    const r = await ingestMemoryPrices();
    const s = summarize({ startedAt, total: r.updated, updated: r.updated, failed: 0, errors: [] });
    console.log(`📥 ingestMemory: ${r.updated} productos (${r.date})`);
    return s;
  } catch (e) {
    return summarize({ startedAt, total: 0, updated: 0, failed: 1, errors: [e.message] });
  }
}

// Monitorización: si HEALTHCHECK_URL está definido, "ficha" tras cada corrida.
// Convención healthchecks.io: /fail si la tanda no actualizó nada.
async function pingMonitor(summary) {
  const url = process.env.HEALTHCHECK_URL;
  if (!url || typeof fetch !== 'function') return;
  const target = (summary.failed && !summary.updated) ? `${url}/fail` : url;
  try { await fetch(target, { method: 'POST', body: JSON.stringify(summary) }); } catch { /* noop */ }
}
