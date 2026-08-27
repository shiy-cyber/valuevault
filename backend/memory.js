// ─────────────────────────────────────────────────────────────
// Precios de memoria (DRAM/NAND/HBM) — memoryindex.io, endpoint público
// (sample-prices.csv): snapshot del día con % de cambio 24h/30d/interanual
// YA calculado por la fuente. NO trae histórico día a día — eso lo acumula
// nuestro propio cron diario en la tabla `memory_price_history` (ver db.js).
// Sin API key, sin coste.
// ─────────────────────────────────────────────────────────────
import { run, all } from './db.js';

const CSV_URL = 'https://memoryindex.io/api/public/sample-prices.csv';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

// Parser CSV simple con soporte de comillas (los campos `name`/`source` traen
// comas dentro, ej. "HBM3E 36GB 12-Hi Stack").
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cells = []; let cur = '', inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    const row = {};
    header.forEach((h, i) => { row[h.trim()] = cells[i]; });
    return row;
  });
}

async function fetchSnapshot() {
  const r = await fetch(CSV_URL, { headers: { 'User-Agent': UA, 'Accept': 'text/csv' }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`memoryindex HTTP ${r.status}`);
  const rows = parseCsv(await r.text());
  return rows.map(r => ({
    contractId: r.contract_id,
    ticker: r.ticker,
    name: r.name,
    segment: r.segment,
    unit: r.unit,
    spot: num(r.spot_usd),
    chg24h: num(r.chg_24h_pct),
    chg30d: num(r.chg_30d_pct),
    chgYoy: num(r.chg_yoy_pct),
    asOf: r.as_of || null,
    source: r.source || null,
  })).filter(r => r.contractId && r.spot != null);
}

let cache = { ts: 0, data: null };
const TTL = 30 * 60 * 1000; // 30 min — es un snapshot diario, no hace falta más fresco

// Snapshot actual (precio + variaciones ya calculadas por la fuente).
export async function getMemoryPrices(force = false) {
  if (!force && cache.data && Date.now() - cache.ts < TTL) return cache.data;
  const data = await fetchSnapshot();
  cache = { ts: Date.now(), data };
  return data;
}

// Ingesta diaria (cron): guarda 1 fila por producto para HOY. Upsert por
// (date, contractId) → si el cron corre más de una vez el mismo día, no duplica.
export async function ingestMemoryPrices() {
  const today = new Date().toISOString().slice(0, 10);
  const snapshot = await getMemoryPrices(true);
  for (const r of snapshot) {
    await run(
      `INSERT INTO memory_price_history (date, contractId, name, segment, unit, spot, chg24h, chg30d, chgYoy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date, contractId) DO UPDATE SET
         spot=excluded.spot, chg24h=excluded.chg24h, chg30d=excluded.chg30d, chgYoy=excluded.chgYoy`,
      [today, r.contractId, r.name, r.segment, r.unit, r.spot, r.chg24h, r.chg30d, r.chgYoy]
    );
  }
  return { date: today, updated: snapshot.length };
}

// Histórico acumulado (nuestro propio, crece día a día) agrupado por producto
// — hasta 2 años de puntos por si el cron lleva mucho corriendo.
export async function getMemoryHistory() {
  const rows = await all(
    `SELECT date, contractId, name, segment, spot FROM memory_price_history
     WHERE date >= date('now', '-730 days') ORDER BY date ASC`
  );
  const byContract = {};
  for (const r of rows) {
    if (!byContract[r.contractId]) byContract[r.contractId] = { contractId: r.contractId, name: r.name, segment: r.segment, points: [] };
    byContract[r.contractId].points.push({ date: r.date, spot: r.spot });
  }
  return Object.values(byContract);
}
