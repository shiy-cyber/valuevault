// ─────────────────────────────────────────────────────────────
// Segmentación de ingresos por producto/línea de negocio — datos reales de
// 10-K (ASC 280 "Segment Reporting"), vía Financial Modeling Prep. Alpha
// Vantage NO tiene equivalente, así que aquí no hay respaldo AV.
//
// El plan de FMP contratado solo cubre un SUBCONJUNTO de tickers (grandes
// caps, comprobado en vivo: AAPL/MSFT sí, CAT no) — para el resto la API
// responde HTTP 402 en texto plano, que fmpQuery() ya trata como "sin dato"
// (null) sin lanzar excepción.
//
// Bajo demanda (no en /quality): su propio endpoint + botón, igual que
// insiders/dividendos. Cacheado en memoria por ticker (TTL 24h — es un dato
// que solo cambia con el 10-K/10-Q anual, no hace falta más fresco).
// ─────────────────────────────────────────────────────────────
import { fmpQuery } from './fmp.js';

const cache = new Map();
const TTL = 24 * 3600 * 1000;

// Normaliza una fila cruda de FMP {fiscalYear, date, data:{segmento:importe}}
// al formato que consume el frontend. null si esa fila no trae nada usable
// (pasa en algunos ejercicios muy antiguos con datos incompletos).
function normalizeRow(row) {
  const segments = Object.entries(row.data || {})
    .map(([name, value]) => ({ name, value: Number(value) }))
    .filter(s => Number.isFinite(s.value) && s.value > 0)
    .sort((a, b) => b.value - a.value);
  if (!segments.length) return null;
  const total = segments.reduce((s, x) => s + x.value, 0);
  return {
    fiscalYear: row.fiscalYear,
    date: row.date,
    total,
    segments: segments.map(s => ({ ...s, pct: +((s.value / total) * 100).toFixed(1) })),
  };
}

export async function getRevenueSegments(ticker) {
  const sym = String(ticker || '').trim().toUpperCase();
  if (!sym) return null;
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  const rows = await fmpQuery('revenue-product-segmentation', { symbol: sym, period: 'annual', structure: 'flat' });
  if (!rows?.length) return null;
  const latest = normalizeRow(rows[0]); // más reciente primero
  if (!latest) return null;

  // Histórico hasta 10 ejercicios (cronológico, más antiguo primero, como el
  // resto de gráficos históricos de la app) para la evolución por segmento —
  // FMP puede traer hasta 15+ años en la misma llamada, sin coste extra.
  // La nomenclatura de segmentos puede cambiar en años antiguos (reorganización
  // de negocio, cambios de reporting) — se deja tal cual la reporta cada 10-K,
  // el frontend ya maneja series con huecos.
  const history = rows.slice(0, 10).map(normalizeRow).filter(Boolean).reverse();

  const data = { ...latest, history };
  cache.set(sym, { ts: Date.now(), data });
  return data;
}
