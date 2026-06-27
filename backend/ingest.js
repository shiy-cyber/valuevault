// ─────────────────────────────────────────────────────────────
// Ingesta programada (patrón cron → BD). PROTOTIPO: cotizaciones.
// El cron llama a estas funciones; trae el dato de la fuente UNA vez y lo
// deja normalizado en Turso. La API de la app luego LEE de la tabla `quotes`
// (nunca hace fetch en vivo en la petición del usuario).
//   · Última copia buena: si un símbolo falla, NO se sobreescribe su fila.
//   · Monitorización: ping opcional a HEALTHCHECK_URL (dead-man switch).
// ─────────────────────────────────────────────────────────────
import { all, run } from './db.js';
import { getQuotes } from './sectors.js';

// Universo ACTIVO: solo los tickers que algún usuario tiene en cartera/watchlist.
// Acota coste/cuota: no se trae "todo el mercado", solo lo que se usa.
async function activeUniverse() {
  const rows = await all("SELECT DISTINCT ticker FROM assets WHERE ticker IS NOT NULL AND ticker != ''");
  return rows.map(r => r.ticker);
}

export async function ingestQuotes() {
  const startedAt = new Date().toISOString();
  const tickers = await activeUniverse();
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

// Monitorización: si HEALTHCHECK_URL está definido, "ficha" tras cada corrida.
// Convención healthchecks.io: /fail si la tanda no actualizó nada.
async function pingMonitor(summary) {
  const url = process.env.HEALTHCHECK_URL;
  if (!url || typeof fetch !== 'function') return;
  const target = (summary.failed && !summary.updated) ? `${url}/fail` : url;
  try { await fetch(target, { method: 'POST', body: JSON.stringify(summary) }); } catch { /* noop */ }
}
