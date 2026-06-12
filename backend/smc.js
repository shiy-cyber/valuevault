// ─────────────────────────────────────────────────────────────
// "Smart Money Concepts" (experimental, heurístico):
//   · Fair Value Gaps (FVG): patrón de 3 velas con hueco de
//     ineficiencia que el precio tiende a rellenar.
//   · Order Blocks (OB): última vela opuesta antes de un movimiento
//     impulsivo — zona donde quedaron órdenes institucionales.
// Datos OHLC diarios de Yahoo. Marca relleno/mitigación y la zona de
// soporte/resistencia no mitigada más cercana al precio. Cache 10 min.
// ─────────────────────────────────────────────────────────────
import { yahooSymbol } from './sectors.js';

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const RANGE_INTERVAL = { '3mo': '1d', '6mo': '1d', '1y': '1d' };
const MIN_GAP = 0.003;    // hueco FVG mínimo: 0.3% del precio (filtra ruido)
const IMPULSE = 0.035;    // vela impulsiva: rango ≥ 3.5% del precio
const MAX_ZONES = 12;     // zonas devueltas (las más recientes) por tipo

async function fetchOHLC(symbol, range, interval) {
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
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o != null && h != null && l != null && c != null) bars.push({ t: ts[i] * 1000, o, h, l, c });
  }
  return { bars, meta: res.meta || {} };
}

const round = (v) => +Number(v).toFixed(2);

function detectFVG(bars) {
  const out = [];
  for (let i = 1; i < bars.length - 1; i++) {
    const a = bars[i - 1], c = bars[i + 1];
    let z = null;
    if (a.h < c.l) z = { type: 'bull', top: c.l, bottom: a.h };
    else if (a.l > c.h) z = { type: 'bear', top: a.l, bottom: c.h };
    if (!z) continue;
    if ((z.top - z.bottom) / bars[i].c < MIN_GAP) continue;
    z.t = bars[i].t; z.idx = i;
    // ¿mitigada / rellena por velas posteriores?
    let mitigated = false, filled = false;
    for (let j = i + 2; j < bars.length; j++) {
      if (z.type === 'bull') {
        if (bars[j].l <= z.top) mitigated = true;
        if (bars[j].l <= z.bottom) { filled = true; break; }
      } else {
        if (bars[j].h >= z.bottom) mitigated = true;
        if (bars[j].h >= z.top) { filled = true; break; }
      }
    }
    out.push({ kind: 'FVG', type: z.type, top: round(z.top), bottom: round(z.bottom), t: z.t, mitigated, filled });
  }
  return out;
}

function detectOB(bars) {
  const seen = new Set();
  const out = [];
  for (let i = 2; i < bars.length; i++) {
    const b = bars[i];
    const strong = (b.h - b.l) / b.c >= IMPULSE && b.c !== b.o;
    if (!strong) continue;
    if (b.c > b.o && b.c > bars[i - 1].h) {            // impulso alcista
      for (let k = i - 1; k >= Math.max(0, i - 6); k--) {
        if (bars[k].c < bars[k].o) { addOB('bull', k, i); break; }
      }
    } else if (b.c < b.o && b.c < bars[i - 1].l) {     // impulso bajista
      for (let k = i - 1; k >= Math.max(0, i - 6); k--) {
        if (bars[k].c > bars[k].o) { addOB('bear', k, i); break; }
      }
    }
  }
  function addOB(type, k, impulseIdx) {
    if (seen.has(k)) return; seen.add(k);
    const ob = bars[k];
    let mitigated = false;
    for (let j = impulseIdx + 1; j < bars.length; j++) {
      if (type === 'bull' && bars[j].l <= ob.h) { mitigated = true; break; }
      if (type === 'bear' && bars[j].h >= ob.l) { mitigated = true; break; }
    }
    out.push({ kind: 'OB', type, top: round(ob.h), bottom: round(ob.l), t: ob.t, mitigated, filled: mitigated });
  }
  return out;
}

const cache = new Map();
const TTL = 10 * 60 * 1000;

export async function getSMC(symbol, range = '6mo') {
  const sym = yahooSymbol(symbol);
  const r = RANGE_INTERVAL[range] ? range : '6mo';
  const key = `${sym}|${r}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  const { bars, meta } = await fetchOHLC(sym, r, RANGE_INTERVAL[r]);
  if (bars.length < 5) throw Object.assign(new Error('Sin datos suficientes para ' + sym), { status: 404 });

  const price = round(meta.regularMarketPrice ?? bars[bars.length - 1].c);
  const zones = [...detectFVG(bars), ...detectOB(bars)].sort((a, b) => a.t - b.t);

  // Soporte = zona alcista NO rellena con techo por debajo del precio (la más cercana)
  // Resistencia = zona bajista NO rellena con suelo por encima del precio (la más cercana)
  const active = zones.filter(z => !z.filled);
  const support = active.filter(z => z.type === 'bull' && z.top <= price).sort((a, b) => b.top - a.top)[0] || null;
  const resistance = active.filter(z => z.type === 'bear' && z.bottom >= price).sort((a, b) => a.bottom - b.bottom)[0] || null;

  const recent = (arr) => arr.slice(-MAX_ZONES);
  const data = {
    symbol: sym, range: r, price,
    closes: bars.map(b => ({ t: b.t, c: round(b.c) })),
    fvgs: recent(zones.filter(z => z.kind === 'FVG')),
    orderBlocks: recent(zones.filter(z => z.kind === 'OB')),
    support, resistance,
    counts: {
      fvgUnfilled: zones.filter(z => z.kind === 'FVG' && !z.filled).length,
      obUnmitigated: zones.filter(z => z.kind === 'OB' && !z.mitigated).length,
    },
  };
  cache.set(key, { ts: Date.now(), data });
  return data;
}
