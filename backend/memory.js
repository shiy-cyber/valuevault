// ─────────────────────────────────────────────────────────────
// Precios de memoria (DRAM/NAND/HBM) — memoryindex.io, endpoint público
// (sample-prices.csv): snapshot del día con % de cambio 24h/30d/interanual
// YA calculado por la fuente. NO trae histórico día a día — eso lo acumula
// nuestro propio cron diario en la tabla `memory_price_history` (ver db.js).
// Sin API key, sin coste.
// ─────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx';
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

// Variaciones a 7/60/90/180 días: la fuente NO las trae (solo 24h/30d/
// interanual) — se calculan contra nuestro propio histórico acumulado,
// comparando el spot de hoy con el punto más cercano a "hace N días". Si no
// hay ningún punto razonablemente cerca (tolerancia por ventana) → null para
// ese producto; se va rellenando solo a medida que pasan los días de cron.
async function getSpotAtDaysAgo(daysAgo, toleranceDays) {
  const rows = await all(`
    SELECT h.contractId, h.spot,
           ABS(julianday(h.date) - julianday('now', '-' || ? || ' days')) AS diff
    FROM memory_price_history h
    INNER JOIN (
      SELECT contractId, MIN(ABS(julianday(date) - julianday('now', '-' || ? || ' days'))) AS mindiff
      FROM memory_price_history
      GROUP BY contractId
    ) best ON best.contractId = h.contractId AND diff = best.mindiff
  `, [daysAgo, daysAgo]);
  const byContract = {};
  for (const r of rows) {
    if (r.diff > toleranceDays || r.spot == null) continue; // demasiado lejos de la ventana → no fiable
    if (!(r.contractId in byContract)) byContract[r.contractId] = r.spot; // si hay empate, se queda el primero
  }
  return byContract; // { contractId: spot de hace ~N días }
}

// Ventanas expuestas al frontend, con su tolerancia (± días de margen para
// encontrar un punto cercano, ya que el cron corre 1 vez/día, no siempre a
// la misma distancia exacta).
const CHANGE_WINDOWS = [[7, 3.5], [60, 7], [90, 10], [180, 15]];

export async function getBackwardChanges() {
  const results = await Promise.all(CHANGE_WINDOWS.map(([days, tol]) => getSpotAtDaysAgo(days, tol)));
  const byWindow = {};
  CHANGE_WINDOWS.forEach(([days], i) => { byWindow[days] = results[i]; });
  return byWindow; // { 7: {contractId: spot}, 60: {...}, 90: {...}, 180: {...} }
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

// ─── Precio: PPI de semiconductores (BLS, histórico real desde 1984) ─────
// OJO — esto NO es un proxy del precio spot: el PPI está ajustado por calidad
// (hedónico) y pondera contratos a largo plazo, así que baja estructuralmente
// año tras año por la Ley de Moore incluso en plena escasez de DRAM/HBM. Es
// el único dato de precio de semiconductores con décadas de histórico real y
// gratis — se complementa con el snapshot spot de arriba, no lo sustituye.
// Serie BLS (misma familia de API que ya usa macro.js: sin bloqueo en
// serverless, a diferencia de FRED/Akamai).
const BLS_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const BLS_SEMI_PPI = 'PCU334413334413'; // PPI: Semiconductor and Related Device Manufacturing

let ppiCache = { ts: 0, data: null };
const PPI_TTL = 12 * 3600 * 1000; // dato mensual → no hace falta refrescar a menudo

export async function getSemiconductorPPI(force = false) {
  if (!force && ppiCache.data && Date.now() - ppiCache.ts < PPI_TTL) return ppiCache.data;
  const year = new Date().getFullYear();
  const body = JSON.stringify({ seriesid: [BLS_SEMI_PPI], startyear: String(year - 9), endyear: String(year) });
  const r = await fetch(BLS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`BLS HTTP ${r.status}`);
  const j = await r.json();
  const series = j.Results?.series?.[0]?.data || [];
  const points = series
    .map(d => ({ date: `${d.year}-${String(d.period || '').replace('M', '').padStart(2, '0')}-01`, value: num(d.value) }))
    .filter(d => d.value != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  // Un array vacío NO es un resultado válido — si BLS cambia el formato de la
  // serie o la descontinúa, mejor un error ruidoso (que Promise.allSettled ya
  // convierte en null en /api/memory-prices) que cachear "éxito" vacío 12h.
  if (!points.length) throw new Error('BLS: serie PPI semiconductores vacía');
  ppiCache = { ts: Date.now(), data: points };
  return points;
}

// ─── Demanda: facturación mundial de semiconductores (WSTS, desde 1986) ──
// El "Blue Book" de WSTS se publica en Excel con nombre de fichero variable
// cada mes (ej. "..._Jun_2026.xlsx") — se descubre el enlace vigente
// raspando la página, no se hardcodea la URL del fichero.
const WSTS_PAGE = 'https://www.wsts.org/67/Historical-Billings-Report';

async function findWstsXlsxUrl() {
  const r = await fetch(WSTS_PAGE, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`WSTS HTTP ${r.status}`);
  const html = await r.text();
  const m = html.match(/href="([^"]*\.xlsx)"/i);
  if (!m) throw new Error('WSTS: enlace .xlsx no encontrado en la página');
  return m[1];
}

let billingsCache = { ts: 0, data: null };
const BILLINGS_TTL = 12 * 3600 * 1000;

export async function getSemiconductorBillings(force = false) {
  if (!force && billingsCache.data && Date.now() - billingsCache.ts < BILLINGS_TTL) return billingsCache.data;
  const url = await findWstsXlsxUrl();
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`WSTS xlsx HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets['Monthly Data'];
  if (!ws) throw new Error('WSTS: hoja "Monthly Data" no encontrada');
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  const points = [];
  let year = null;
  for (const row of rows) {
    if (!Array.isArray(row) || !row.length) continue;
    if (typeof row[0] === 'number' && row.slice(1).every(v => v == null)) { year = row[0]; continue; }
    if (String(row[0] || '').trim() === 'Worldwide' && year) {
      for (let m = 0; m < 12; m++) {
        const v = row[m + 1];
        if (typeof v === 'number') points.push({ date: `${year}-${String(m + 1).padStart(2, '0')}-01`, value: +(v / 1000).toFixed(1) }); // miles US$ → millones US$
      }
    }
  }
  // Igual que el PPI: un array vacío es indicio de que WSTS cambió el
  // formato del Excel (fila "Worldwide" no encontrada, etc.) — mejor fallar
  // ruidosamente que cachear "éxito" vacío 12h sin que nadie se entere.
  if (!points.length) throw new Error('WSTS: no se encontraron filas "Worldwide" en el Excel');
  billingsCache = { ts: Date.now(), data: points };
  return points;
}
