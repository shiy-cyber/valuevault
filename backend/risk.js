// ─────────────────────────────────────────────────────────────
// Riesgo cuantitativo de cartera vía Yahoo (histórico diario).
// Por activo: volatilidad anualizada (%) y máximo drawdown (%).
// Entre activos: matriz de correlación de Pearson de los rendimientos
// diarios (alineados por fecha). Cache 30 min por conjunto+rango.
// ─────────────────────────────────────────────────────────────
import { fetchChart, yahooSymbol } from './sectors.js';

const TRADING_DAYS = 252;

// Mapa fecha(YYYY-MM-DD) → rendimiento diario, para poder alinear series
function dailyReturns(points) {
  const map = new Map();
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].close;
    if (!prev) continue;
    const r = points[i].close / prev - 1;
    if (Number.isFinite(r)) map.set(new Date(points[i].t).toISOString().slice(0, 10), r);
  }
  return map;
}

function stdev(arr) {
  if (arr.length < 2) return null;
  const m = arr.reduce((s, x) => s + x, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

// Peor caída pico-a-valle de la serie de cierres (valor negativo, en %)
function maxDrawdown(points) {
  let peak = -Infinity, mdd = 0;
  for (const p of points) {
    if (p.close > peak) peak = p.close;
    if (peak > 0) { const dd = p.close / peak - 1; if (dd < mdd) mdd = dd; }
  }
  return mdd;
}

// Correlación de Pearson entre dos mapas de rendimientos (fechas comunes)
function correlation(aMap, bMap) {
  const keys = [...aMap.keys()].filter(k => bMap.has(k));
  if (keys.length < 20) return null; // muestra insuficiente
  const a = keys.map(k => aMap.get(k));
  const b = keys.map(k => bMap.get(k));
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  const den = Math.sqrt(da * db);
  return den ? +(num / den).toFixed(2) : null;
}

const cache = new Map(); // key → { ts, data }
const TTL = 30 * 60 * 1000;

export async function getRisk(symbols, range = '1y') {
  const uniq = [...new Set(symbols.map(s => String(s || '').trim()).filter(Boolean))];
  const key = range + '|' + uniq.slice().sort().join(',');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  const series = await Promise.all(uniq.map(async (sym) => {
    try {
      const { points } = await fetchChart(yahooSymbol(sym), range, '1d');
      const ret = dailyReturns(points);
      const arr = [...ret.values()];
      const sd = stdev(arr);
      return {
        symbol: sym, returns: ret,
        vol: sd != null ? +(sd * Math.sqrt(TRADING_DAYS) * 100).toFixed(1) : null,
        maxDD: points.length ? +(maxDrawdown(points) * 100).toFixed(1) : null,
        n: arr.length,
      };
    } catch (e) {
      return { symbol: sym, returns: new Map(), vol: null, maxDD: null, n: 0, error: e.message };
    }
  }));

  const corr = series.map(a => series.map(b => a.symbol === b.symbol ? 1 : correlation(a.returns, b.returns)));
  const data = {
    range,
    assets: series.map(s => ({ symbol: s.symbol, vol: s.vol, maxDD: s.maxDD, n: s.n })),
    matrix: { symbols: series.map(s => s.symbol), corr },
  };
  cache.set(key, { ts: Date.now(), data });
  return data;
}
