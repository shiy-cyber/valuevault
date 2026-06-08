// ─────────────────────────────────────────────────────────────
// Tendencias sectoriales en tiempo real vía Yahoo Finance.
// Usa el endpoint público v8/finance/chart (sin clave, sin límite).
// Devuelve, por cada ETF sectorial, precio + variación diaria y
// series acumuladas de 12 puntos para los periodos 1m/3m/6m/1y/ytd.
// (mismo formato que consumía el HTML original con datos mock)
// ─────────────────────────────────────────────────────────────

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Metadatos de presentación (color/icono) — idénticos al diseño original
export const SECTOR_META = [
  { name: 'Technology',     etf: 'XLK',  color: '#3a8eff', icon: '💻' },
  { name: 'Healthcare',     etf: 'XLV',  color: '#2ecc71', icon: '🏥' },
  { name: 'Financials',     etf: 'XLF',  color: '#c9a84c', icon: '🏦' },
  { name: 'Energy',         etf: 'XLE',  color: '#e67e22', icon: '⚡' },
  { name: 'Consumer',       etf: 'XLY',  color: '#9b59b6', icon: '🛍' },
  { name: 'Industrials',    etf: 'XLI',  color: '#1abc9c', icon: '🏭' },
  { name: 'Real Estate',    etf: 'XLRE', color: '#e74c3c', icon: '🏢' },
  { name: 'Utilities',      etf: 'XLU',  color: '#f39c12', icon: '💡' },
  { name: 'Materials',      etf: 'XLB',  color: '#8e44ad', icon: '⚗️' },
  { name: 'Comm. Services', etf: 'XLC',  color: '#16a085', icon: '📡' },
];

const PERIODS = ['1m', '3m', '6m', '1y', 'ytd'];
const POINTS = 12; // 12 puntos por serie (como el original)

// Normaliza tickers al formato de Yahoo (clases de acción: BRK.B → BRK-B)
export function yahooSymbol(t) {
  return String(t || '').trim().toUpperCase().replace(/\./g, '-');
}

export async function fetchChart(symbol, range = '1y', interval = '1d') {
  const url = `${YF_BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error('Respuesta Yahoo vacía');
  const ts = res.timestamp || [];
  const closeRaw = res.indicators?.quote?.[0]?.close || [];
  // Empareja timestamp/close descartando huecos (null)
  const points = [];
  for (let i = 0; i < ts.length; i++) {
    if (closeRaw[i] != null) points.push({ t: ts[i] * 1000, close: closeRaw[i] });
  }
  return { points, meta: res.meta || {} };
}

// Nº aproximado de sesiones bursátiles por ventana
function windowLength(period, points) {
  switch (period) {
    case '1m': return 21;
    case '3m': return 63;
    case '6m': return 126;
    case '1y': return 252;
    case 'ytd': {
      const year = new Date().getUTCFullYear();
      let n = 0;
      for (let i = points.length - 1; i >= 0; i--) {
        if (new Date(points[i].t).getUTCFullYear() === year) n++; else break;
      }
      return Math.max(n, 2);
    }
    default: return 21;
  }
}

// Serie acumulada de 12 puntos relativa al inicio de la ventana
function buildSeries(closes, len) {
  const n = closes.length;
  const start = Math.max(0, n - len);
  const base = closes[start];
  const span = n - 1 - start;
  const out = [];
  for (let i = 0; i < POINTS; i++) {
    const idx = span <= 0 ? n - 1 : start + Math.round((i * span) / (POINTS - 1));
    out.push(+(((closes[idx] / base) - 1) * 100).toFixed(2));
  }
  return out;
}

let cache = { ts: 0, data: null };
const TTL = 10 * 60 * 1000; // 10 min

export async function getSectors() {
  if (cache.data && Date.now() - cache.ts < TTL) return cache.data;

  const results = await Promise.all(SECTOR_META.map(async (m) => {
    const base = { ...m };
    try {
      const { points, meta } = await fetchChart(m.etf, '1y', '1d');
      const closes = points.map(p => p.close);
      if (closes.length < 2) throw new Error('sin datos');

      const last = meta.regularMarketPrice ?? closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      base.price = +Number(last).toFixed(2);
      base.changePercent = +(((closes[closes.length - 1] - prev) / prev) * 100).toFixed(2);

      for (const p of PERIODS) base[p] = buildSeries(closes, windowLength(p, points));
      base.live = true;
    } catch (e) {
      // Fallback para que la UI nunca quede vacía
      base.price = null;
      base.changePercent = 0;
      for (const p of PERIODS) base[p] = new Array(POINTS).fill(0);
      base.live = false;
      base.error = e.message;
    }
    return base;
  }));

  cache = { ts: Date.now(), data: results };
  return results;
}

// Cotización puntual en tiempo real de un símbolo cualquiera
export async function getQuote(symbol) {
  const { meta } = await fetchChart(yahooSymbol(symbol), '5d', '1d');
  return {
    symbol: meta.symbol || symbol,
    price: meta.regularMarketPrice ?? null,
    previousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
    changePercent: (meta.regularMarketPrice && meta.chartPreviousClose)
      ? +(((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100).toFixed(2)
      : null,
    currency: meta.currency || null,
  };
}

// Cotización en lote (para refrescar toda la cartera). Tolera fallos por símbolo.
export async function getQuotes(symbols) {
  return Promise.all(symbols.map(async (s) => {
    try {
      const { meta } = await fetchChart(yahooSymbol(s), '5d', '1d');
      const price = meta.regularMarketPrice ?? null;
      const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
      return {
        symbol: s,
        price: price != null ? +Number(price).toFixed(2) : null,
        previousClose: prev,
        changePercent: (price != null && prev) ? +(((price - prev) / prev) * 100).toFixed(2) : null,
      };
    } catch (e) {
      return { symbol: s, price: null, error: e.message };
    }
  }));
}

// Serie histórica de cierres para el gráfico por activo
const RANGE_INTERVAL = { '1mo': '1d', '6mo': '1d', '1y': '1d', '5y': '1wk' };
export async function getHistory(symbol, range = '6mo') {
  const r = RANGE_INTERVAL[range] ? range : '6mo';
  const { points } = await fetchChart(yahooSymbol(symbol), r, RANGE_INTERVAL[r]);
  return { symbol, range: r, points: points.map(p => ({ t: p.t, close: +p.close.toFixed(2) })) };
}
