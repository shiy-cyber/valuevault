// ─────────────────────────────────────────────────────────────
// Trend Following / CTA — seguimiento de tendencia (Managed Futures).
//   No pregunta "cuánto vale" sino "qué hace el precio":
//   · Régimen por cruce de medias 50/200 (alcista/bajista/lateral).
//   · Breakout Donchian (máx/mín de N días, estilo Turtle) = disparador.
//   · ATR (Average True Range) para el stop y para medir la fuerza.
//   · Volatility targeting: tamaño de posición que mantiene el riesgo
//     constante (más volatilidad ⇒ menos exposición).
// Datos OHLCV de Yahoo (gratis). Cache 15 min por símbolo/rango.
// ─────────────────────────────────────────────────────────────
import { yahooSymbol } from './sectors.js';

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const RANGE_INTERVAL = { '6mo': '1d', '1y': '1d', '2y': '1d' };
const TRADING_DAYS = 252;

// Parámetros del modelo
const SMA_FAST = 50, SMA_SLOW = 200, EMA_LEN = 20;
const ATR_LEN = 14, DONCHIAN = 20, SLOPE_LB = 20, VOL_LB = 20;
const ATR_STOP_K = 2;        // stop a 2·ATR
const TARGET_VOL = 0.15;     // volatility targeting: 15% anualizado

// ─── Descarga OHLCV (incluye open, a diferencia de volprofile.js) ───
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
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if (h != null && l != null && c != null) bars.push({ t: ts[i] * 1000, o: o ?? c, h, l, c, v: v ?? 0 });
  }
  return { bars, meta: res.meta || {} };
}

const withTimeout = (p, ms, label) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms)),
]);

// ─── Indicadores (puro JS sobre arrays) ───
function smaSeries(closes, n) {
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function emaSeries(closes, n) {
  const out = new Array(closes.length).fill(null);
  const k = 2 / (n + 1);
  let prev = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < n - 1) continue;
    if (prev == null) { // primer EMA = SMA de las primeras n
      let s = 0; for (let j = i - n + 1; j <= i; j++) s += closes[j];
      prev = s / n;
    } else {
      prev = closes[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

// ATR de Wilder
function atrSeries(bars, n) {
  const out = new Array(bars.length).fill(null);
  const tr = bars.map((b, i) => i === 0 ? b.h - b.l
    : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c)));
  let prev = null;
  for (let i = 0; i < bars.length; i++) {
    if (i < n) continue;
    if (prev == null) {
      let s = 0; for (let j = 1; j <= n; j++) s += tr[j]; prev = s / n;
    } else {
      prev = (prev * (n - 1) + tr[i]) / n;
    }
    out[i] = prev;
  }
  return out;
}

// Canal Donchian: máx/mín de las n velas PREVIAS (excluye la actual)
function donchianSeries(bars, n) {
  const hi = new Array(bars.length).fill(null);
  const lo = new Array(bars.length).fill(null);
  for (let i = n; i < bars.length; i++) {
    let mx = -Infinity, mn = Infinity;
    for (let j = i - n; j < i; j++) { if (bars[j].h > mx) mx = bars[j].h; if (bars[j].l < mn) mn = bars[j].l; }
    hi[i] = mx; lo[i] = mn;
  }
  return { hi, lo };
}

function realizedVol(closes, lb) {
  if (closes.length < lb + 1) return null;
  const rets = [];
  for (let i = closes.length - lb; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev) rets.push(closes[i] / prev - 1);
  }
  if (rets.length < 2) return null;
  const m = rets.reduce((s, x) => s + x, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(TRADING_DAYS); // anualizada (fracción)
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r2 = (x) => x == null ? null : +x.toFixed(2);

// ─── Núcleo: analiza un símbolo ───
function analyze(bars) {
  const closes = bars.map(b => b.c);
  const n = closes.length;
  const last = n - 1;
  const price = closes[last];

  const sma50 = smaSeries(closes, SMA_FAST);
  const sma200 = smaSeries(closes, SMA_SLOW);
  const ema = emaSeries(closes, EMA_LEN);
  const atr = atrSeries(bars, ATR_LEN);
  const { hi: donHi, lo: donLo } = donchianSeries(bars, DONCHIAN);

  const s50 = sma50[last], s200 = sma200[last], atrNow = atr[last];
  const donHigh = donHi[last], donLow = donLo[last];
  const rVol = realizedVol(closes, VOL_LB);

  // Régimen por alineación de medias. Si no hay SMA200 (rango corto),
  // se usa la pendiente de la SMA50 como sustituto del filtro lento.
  const slowOk = s200 != null;
  const slopePct = (s50 != null && sma50[last - SLOPE_LB] != null)
    ? (s50 - sma50[last - SLOPE_LB]) / sma50[last - SLOPE_LB] : 0;
  const regimeUp = s50 != null && price > s50 && (slowOk ? s50 > s200 : slopePct > 0);
  const regimeDown = s50 != null && price < s50 && (slowOk ? s50 < s200 : slopePct < 0);

  // Breakout Donchian = disparador de entrada (confirma la tendencia)
  const breakUp = donHigh != null && price > donHigh;
  const breakDown = donLow != null && price < donLow;

  let signal = 'flat';
  if (regimeUp) signal = 'long';
  else if (regimeDown) signal = 'short';
  const dir = signal === 'long' ? 1 : signal === 'short' ? -1 : 0;
  const breakoutConfirms = (signal === 'long' && breakUp) || (signal === 'short' && breakDown);
  const breakout = breakUp ? 'up' : breakDown ? 'down' : null;

  // Fuerza 0-100: distancia a la SMA50 en ATRs + pendiente + breakout
  const distATR = atrNow ? Math.abs(price - s50) / atrNow : 0;
  let strength = signal === 'flat' ? 0
    : Math.min(distATR / 3, 1) * 45 + Math.min(Math.abs(slopePct) / 0.10, 1) * 35 + (breakoutConfirms ? 20 : 0);
  strength = Math.round(clamp(strength, 0, 100));

  // Gestión de riesgo
  const stop = dir !== 0 && atrNow ? price - dir * ATR_STOP_K * atrNow : null;
  const stopPct = stop != null ? (stop / price - 1) * 100 : null;
  const volTargetSize = rVol ? clamp((TARGET_VOL / rVol) * 100, 0, 300) : null;

  return {
    price: r2(price),
    sma50: r2(s50), sma200: r2(s200), ema: r2(ema[last]),
    atr: r2(atrNow), atrPct: atrNow ? r2((atrNow / price) * 100) : null,
    donchianHigh: r2(donHigh), donchianLow: r2(donLow),
    signal, strength, breakout, breakoutConfirms,
    stop: r2(stop), stopPct: r2(stopPct),
    realizedVol: rVol != null ? r2(rVol * 100) : null,
    targetVol: TARGET_VOL * 100,
    volTargetSize: volTargetSize != null ? Math.round(volTargetSize) : null,
    bars, sma50Series: sma50, sma200Series: sma200, donHiSeries: donHi, donLoSeries: donLo,
  };
}

// ─── Cache ───
const cache = new Map(); // key → { ts, data }
const TTL = 15 * 60 * 1000;

export async function getTrendFollowing(symbol, range = '1y') {
  const rg = RANGE_INTERVAL[range] ? range : '1y';
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) throw Object.assign(new Error('Falta símbolo'), { status: 400 });
  const key = `tf|${sym}|${rg}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  const { bars, meta } = await fetchOHLCV(yahooSymbol(sym), rg, RANGE_INTERVAL[rg]);
  if (bars.length < SMA_FAST + 5) throw new Error(`Histórico insuficiente para ${sym}`);

  const a = analyze(bars);
  const data = {
    symbol: sym, range: rg, currency: meta.currency || 'USD',
    price: a.price, sma50: a.sma50, sma200: a.sma200, ema: a.ema,
    atr: a.atr, atrPct: a.atrPct, donchianHigh: a.donchianHigh, donchianLow: a.donchianLow,
    signal: a.signal, strength: a.strength, breakout: a.breakout, breakoutConfirms: a.breakoutConfirms,
    stop: a.stop, stopPct: a.stopPct,
    realizedVol: a.realizedVol, targetVol: a.targetVol, volTargetSize: a.volTargetSize,
    series: {
      labels: bars.map(b => b.t),
      close: bars.map(b => r2(b.c)),
      sma50: a.sma50Series.map(r2),
      sma200: a.sma200Series.map(r2),
      donHigh: a.donHiSeries.map(r2),
      donLow: a.donLoSeries.map(r2),
    },
  };
  cache.set(key, { ts: Date.now(), data });
  return data;
}

// ─── Universo CTA: clases de activo descorrelacionadas ───
const UNIVERSE = [
  { symbol: '^GSPC', label: 'S&P 500', class: 'Índices' },
  { symbol: '^NDX', label: 'Nasdaq 100', class: 'Índices' },
  { symbol: '^STOXX', label: 'STOXX 600', class: 'Índices' },
  { symbol: '^N225', label: 'Nikkei 225', class: 'Índices' },
  { symbol: 'TLT', label: 'Bono 20Y+ EEUU', class: 'Bonos' },
  { symbol: 'IEF', label: 'Bono 7-10Y EEUU', class: 'Bonos' },
  { symbol: 'GC=F', label: 'Oro', class: 'Materias primas' },
  { symbol: 'SI=F', label: 'Plata', class: 'Materias primas' },
  { symbol: 'CL=F', label: 'Crudo WTI', class: 'Materias primas' },
  { symbol: 'NG=F', label: 'Gas natural', class: 'Materias primas' },
  { symbol: 'HG=F', label: 'Cobre', class: 'Materias primas' },
  { symbol: 'ZW=F', label: 'Trigo', class: 'Materias primas' },
  { symbol: 'EURUSD=X', label: 'EUR/USD', class: 'Divisas' },
  { symbol: 'USDJPY=X', label: 'USD/JPY', class: 'Divisas' },
  { symbol: 'GBPUSD=X', label: 'GBP/USD', class: 'Divisas' },
  { symbol: 'BTC-USD', label: 'Bitcoin', class: 'Cripto' },
  { symbol: 'ETH-USD', label: 'Ethereum', class: 'Cripto' },
  { symbol: '^VIX', label: 'VIX (volatilidad)', class: 'Volatilidad' },
];

const uniCache = new Map();
const UNI_TTL = 15 * 60 * 1000;

export async function getTrendUniverse(range = '1y') {
  const rg = RANGE_INTERVAL[range] ? range : '1y';
  const key = `uni|${rg}`;
  const hit = uniCache.get(key);
  if (hit && Date.now() - hit.ts < UNI_TTL) return hit.data;

  const results = await Promise.allSettled(UNIVERSE.map(m => withTimeout((async () => {
    const { bars } = await fetchOHLCV(yahooSymbol(m.symbol), rg, RANGE_INTERVAL[rg]);
    if (bars.length < SMA_FAST + 5) throw new Error('insuficiente');
    const a = analyze(bars);
    const prev = bars.length >= 2 ? bars[bars.length - 2].c : null;
    const changePct = prev ? +(((a.price / prev) - 1) * 100).toFixed(2) : null;
    return {
      symbol: m.symbol, label: m.label, class: m.class,
      price: a.price, changePct, signal: a.signal, strength: a.strength,
      breakout: a.breakout, sma50: a.sma50, sma200: a.sma200, stopPct: a.stopPct,
    };
  })(), 9500, m.symbol)));

  const markets = results.map((res, i) => res.status === 'fulfilled'
    ? res.value
    : { ...UNIVERSE[i], price: null, changePct: null, signal: null, strength: null, error: String(res.reason).slice(0, 80) });

  const ok = markets.filter(m => m.signal);
  const summary = {
    long: ok.filter(m => m.signal === 'long').length,
    short: ok.filter(m => m.signal === 'short').length,
    flat: ok.filter(m => m.signal === 'flat').length,
    failed: markets.length - ok.length,
  };
  const data = { range: rg, count: markets.length, summary, markets };
  uniCache.set(key, { ts: Date.now(), data });
  return data;
}
