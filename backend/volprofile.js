// ─────────────────────────────────────────────────────────────
// Microestructura "Smart Money": Perfil de Volumen + Anchored VWAP.
//   · Volume Profile: histograma de volumen por nivel de precio →
//     POC (Point of Control) y Value Area (70% del volumen, VAH/VAL).
//   · Anchored VWAP: precio medio ponderado por volumen desde un
//     ancla (inicio del rango, YTD, máximo o mínimo del periodo).
// Datos OHLCV de Yahoo (gratis). Cache 10 min por símbolo/rango/ancla.
// ─────────────────────────────────────────────────────────────
import { yahooSymbol } from './sectors.js';

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const BINS = 50;
const RANGE_INTERVAL = { '3mo': '1d', '6mo': '1d', '1y': '1d', '2y': '1d' };

async function fetchOHLCV(symbol, range, interval) {
  const url = `${YF_BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error('Respuesta Yahoo vacía');
  const ts = res.timestamp || [];
  const q = res.indicators?.quote?.[0] || {};
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if (h != null && l != null && c != null && v != null) bars.push({ t: ts[i] * 1000, h, l, c, v });
  }
  return { bars, meta: res.meta || {} };
}

function pickAnchorIdx(bars, anchor) {
  if (anchor === 'ytd') {
    const y = new Date().getUTCFullYear();
    const idx = bars.findIndex(b => new Date(b.t).getUTCFullYear() === y);
    return idx < 0 ? 0 : idx;
  }
  if (anchor === 'high') { let i = 0; for (let k = 1; k < bars.length; k++) if (bars[k].h > bars[i].h) i = k; return i; }
  if (anchor === 'low')  { let i = 0; for (let k = 1; k < bars.length; k++) if (bars[k].l < bars[i].l) i = k; return i; }
  return 0; // inicio del rango
}

const cache = new Map();
const TTL = 10 * 60 * 1000;

export async function getVolProfile(symbol, range = '1y', anchor = 'range') {
  const sym = yahooSymbol(symbol);
  const r = RANGE_INTERVAL[range] ? range : '1y';
  const key = `${sym}|${r}|${anchor}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  const { bars, meta } = await fetchOHLCV(sym, r, RANGE_INTERVAL[r]);
  if (bars.length < 5) throw Object.assign(new Error('Sin datos suficientes para ' + sym), { status: 404 });

  // ─── Volume Profile ───
  const pMin = Math.min(...bars.map(b => b.l));
  const pMax = Math.max(...bars.map(b => b.h));
  const binSize = (pMax - pMin) / BINS || 1;
  const vol = new Array(BINS).fill(0);
  for (const b of bars) {
    const loBin = Math.max(0, Math.floor((b.l - pMin) / binSize));
    const hiBin = Math.min(BINS - 1, Math.floor((b.h - pMin) / binSize));
    const vPer = b.v / (hiBin - loBin + 1);
    for (let k = loBin; k <= hiBin; k++) vol[k] += vPer;
  }
  let pocIdx = 0;
  for (let i = 1; i < BINS; i++) if (vol[i] > vol[pocIdx]) pocIdx = i;

  // Value Area = 70% del volumen alrededor del POC (expandiendo al lado más voluminoso)
  const total = vol.reduce((a, b) => a + b, 0);
  const target = total * 0.7;
  let lo = pocIdx, hi = pocIdx, acc = vol[pocIdx];
  while (acc < target && (lo > 0 || hi < BINS - 1)) {
    const below = lo > 0 ? vol[lo - 1] : -1;
    const above = hi < BINS - 1 ? vol[hi + 1] : -1;
    if (above >= below) { hi++; acc += vol[hi]; } else { lo--; acc += vol[lo]; }
  }
  const edge = (i) => +(pMin + i * binSize).toFixed(2);
  const bins = vol.map((v, i) => ({
    low: edge(i), high: edge(i + 1), mid: +(pMin + (i + 0.5) * binSize).toFixed(2),
    volume: Math.round(v), inVA: i >= lo && i <= hi, isPOC: i === pocIdx,
  }));

  // ─── Anchored VWAP ───
  const anchorIdx = pickAnchorIdx(bars, anchor);
  const series = []; let cumPV = 0, cumV = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i < anchorIdx) { series.push({ t: bars[i].t, vwap: null }); continue; }
    const tp = (bars[i].h + bars[i].l + bars[i].c) / 3;
    cumPV += tp * bars[i].v; cumV += bars[i].v;
    series.push({ t: bars[i].t, vwap: +(cumPV / cumV).toFixed(2) });
  }

  const price = +Number(meta.regularMarketPrice ?? bars[bars.length - 1].c).toFixed(2);
  const data = {
    symbol: sym, range: r,
    price,
    closes: bars.map(b => ({ t: b.t, c: +b.c.toFixed(2) })),
    bins,
    poc: +(pMin + (pocIdx + 0.5) * binSize).toFixed(2),
    vah: edge(hi + 1),
    val: edge(lo),
    vwap: { anchor, anchorDate: bars[anchorIdx]?.t ?? null, value: series[series.length - 1]?.vwap ?? null, series },
  };
  cache.set(key, { ts: Date.now(), data });
  return data;
}
