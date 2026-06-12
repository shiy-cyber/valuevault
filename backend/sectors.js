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

// Serie acumulada de 12 puntos relativa al inicio de la ventana.
// Devuelve { series, labels } donde labels son los timestamps (ms) reales
// de cada punto muestreado, para que el eje X del frontend sea correcto.
function buildSeries(points, len) {
  const closes = points.map(p => p.close);
  const n = closes.length;
  const start = Math.max(0, n - len);
  const base = closes[start];
  const span = n - 1 - start;
  const series = [];
  const labels = [];
  for (let i = 0; i < POINTS; i++) {
    const idx = span <= 0 ? n - 1 : start + Math.round((i * span) / (POINTS - 1));
    series.push(+(((closes[idx] / base) - 1) * 100).toFixed(2));
    labels.push(points[idx].t);
  }
  return { series, labels };
}

// Serie de 12 puntos para ventanas LARGAS, seleccionando por FECHA (no por
// nº de puntos): Yahoo en range='max' espacia los puntos de forma irregular,
// así que tomamos como inicio el primer punto dentro de los últimos `years`.
function buildSeriesByTime(points, years) {
  if (!points.length) return { series: new Array(POINTS).fill(0), labels: [] };
  const cutoff = Date.now() - years * 365.25 * 86400000;
  let start = points.findIndex(p => p.t >= cutoff);
  if (start < 0) start = Math.max(0, points.length - 2); // histórico más corto que la ventana
  const closes = points.map(p => p.close);
  const base = closes[start];
  const n = closes.length;
  const span = n - 1 - start;
  const series = [];
  const labels = [];
  for (let i = 0; i < POINTS; i++) {
    const idx = span <= 0 ? n - 1 : start + Math.round((i * span) / (POINTS - 1));
    series.push(+(((closes[idx] / base) - 1) * 100).toFixed(2));
    labels.push(points[idx].t);
  }
  return { series, labels };
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

      base.labels = {};
      for (const p of PERIODS) {
        const { series, labels } = buildSeries(points, windowLength(p, points));
        base[p] = series;
        base.labels[p] = labels;
      }
      base.live = true;
    } catch (e) {
      // Fallback para que la UI nunca quede vacía
      base.price = null;
      base.changePercent = 0;
      base.labels = {};
      const now = Date.now();
      for (const p of PERIODS) {
        base[p] = new Array(POINTS).fill(0);
        // etiquetas de respaldo: 12 puntos hacia atrás desde hoy
        base.labels[p] = Array.from({ length: POINTS }, (_, i) => now - (POINTS - 1 - i) * 86400000);
      }
      base.live = false;
      base.error = e.message;
    }
    return base;
  }));

  cache = { ts: Date.now(), data: results };
  return results;
}

// ─────────────────────────────────────────────────────────────
// ÍNDICES BURSÁTILES principales en tiempo real vía Yahoo Finance.
// Mismo formato que getSectors(): precio + variación diaria y series
// acumuladas de 12 puntos para 1m/3m/6m/1y/ytd. Cache 10 min.
// ─────────────────────────────────────────────────────────────
export const INDEX_META = [
  // ── Estados Unidos ──
  { name: 'S&P 500',        symbol: '^GSPC',    region: 'USA',    color: '#3a8eff', icon: '🇺🇸' },
  { name: 'Nasdaq 100',     symbol: '^NDX',     region: 'USA',    color: '#9b59b6', icon: '💻' },
  { name: 'Nasdaq Comp.',   symbol: '^IXIC',    region: 'USA',    color: '#8e44ad', icon: '📈' },
  { name: 'Dow Jones',      symbol: '^DJI',     region: 'USA',    color: '#c9a84c', icon: '🏛' },
  { name: 'Russell 2000',   symbol: '^RUT',     region: 'USA',    color: '#1abc9c', icon: '🏢' },
  { name: 'VIX (Volat.)',   symbol: '^VIX',     region: 'USA',    color: '#e74c3c', icon: '😨' },
  // ── Europa ──
  { name: 'Euro Stoxx 50',  symbol: '^STOXX50E', region: 'Europa', color: '#2ecc71', icon: '🇪🇺' },
  { name: 'IBEX 35',        symbol: '^IBEX',    region: 'Europa', color: '#e67e22', icon: '🇪🇸' },
  { name: 'DAX (Alemania)', symbol: '^GDAXI',   region: 'Europa', color: '#f39c12', icon: '🇩🇪' },
  { name: 'CAC 40',         symbol: '^FCHI',    region: 'Europa', color: '#16a085', icon: '🇫🇷' },
  { name: 'FTSE 100',       symbol: '^FTSE',    region: 'Europa', color: '#3498db', icon: '🇬🇧' },
  // ── Asia ──
  { name: 'Nikkei 225',     symbol: '^N225',    region: 'Asia',   color: '#e84393', icon: '🇯🇵' },
  { name: 'Hang Seng',      symbol: '^HSI',     region: 'Asia',   color: '#d35400', icon: '🇭🇰' },
];

// Periodos cortos → datos diarios (1 año). Periodos largos → histórico máximo,
// con la ventana seleccionada por nº de años (buildSeriesByTime).
const IDX_SHORT = ['1m', '3m', '6m', '1y', 'ytd'];
const IDX_LONG_YEARS = { '3y': 3, '5y': 5, '10y': 10, '20y': 20 };
const IDX_PERIODS = [...IDX_SHORT, ...Object.keys(IDX_LONG_YEARS)];

let idxCache = { ts: 0, data: null };
export async function getIndices(force = false) {
  if (!force && idxCache.data && Date.now() - idxCache.ts < TTL) return idxCache.data;

  const results = await Promise.all(INDEX_META.map(async (m) => {
    const base = { ...m };
    try {
      // Diario (1a) para periodos cortos + mensual (máx histórico) para los largos
      const [daily, monthly] = await Promise.all([
        fetchChart(m.symbol, '1y', '1d'),
        fetchChart(m.symbol, 'max', '1mo'),
      ]);
      const closes = daily.points.map(p => p.close);
      if (closes.length < 2) throw new Error('sin datos');

      const last = daily.meta.regularMarketPrice ?? closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      base.price = +Number(last).toFixed(2);
      base.changePercent = +(((closes[closes.length - 1] - prev) / prev) * 100).toFixed(2);
      base.currency = daily.meta.currency || null;

      base.labels = {};
      for (const p of IDX_SHORT) {
        const { series, labels } = buildSeries(daily.points, windowLength(p, daily.points));
        base[p] = series;
        base.labels[p] = labels;
      }
      for (const [p, years] of Object.entries(IDX_LONG_YEARS)) {
        const { series, labels } = buildSeriesByTime(monthly.points, years);
        base[p] = series;
        base.labels[p] = labels;
      }
      base.live = true;
    } catch (e) {
      base.price = null;
      base.changePercent = 0;
      base.labels = {};
      const now = Date.now();
      for (const p of IDX_PERIODS) {
        base[p] = new Array(POINTS).fill(0);
        base.labels[p] = Array.from({ length: POINTS }, (_, i) => now - (POINTS - 1 - i) * 86400000);
      }
      base.live = false;
      base.error = e.message;
    }
    return base;
  }));

  idxCache = { ts: Date.now(), data: results };
  return results;
}

// ─────────────────────────────────────────────────────────────
// MAPA DE MERCADO estilo Finviz (treemap).
// Cesta curada de grandes valores: sector + industria + capitalización
// aprox (B$, para el tamaño del rectángulo). La variación % y el precio
// se traen en vivo de Yahoo. Cache 15 min.
// ─────────────────────────────────────────────────────────────
const MARKET_BASKET = [
  // Technology
  { ticker:'AAPL', name:'Apple', sector:'Technology', industry:'Consumer Electronics', cap:3400 },
  { ticker:'MSFT', name:'Microsoft', sector:'Technology', industry:'Software', cap:3100 },
  { ticker:'NVDA', name:'NVIDIA', sector:'Technology', industry:'Semiconductors', cap:3000 },
  { ticker:'AVGO', name:'Broadcom', sector:'Technology', industry:'Semiconductors', cap:1100 },
  { ticker:'ORCL', name:'Oracle', sector:'Technology', industry:'Software', cap:500 },
  { ticker:'AMD', name:'AMD', sector:'Technology', industry:'Semiconductors', cap:240 },
  { ticker:'CRM', name:'Salesforce', sector:'Technology', industry:'Software', cap:280 },
  { ticker:'ADBE', name:'Adobe', sector:'Technology', industry:'Software', cap:230 },
  // Communication Services
  { ticker:'GOOGL', name:'Alphabet', sector:'Communication Services', industry:'Internet Content', cap:2200 },
  { ticker:'META', name:'Meta Platforms', sector:'Communication Services', industry:'Internet Content', cap:1300 },
  { ticker:'NFLX', name:'Netflix', sector:'Communication Services', industry:'Entertainment', cap:300 },
  { ticker:'DIS', name:'Disney', sector:'Communication Services', industry:'Entertainment', cap:200 },
  // Consumer Cyclical
  { ticker:'AMZN', name:'Amazon', sector:'Consumer Cyclical', industry:'Internet Retail', cap:2000 },
  { ticker:'TSLA', name:'Tesla', sector:'Consumer Cyclical', industry:'Auto Manufacturers', cap:800 },
  { ticker:'HD', name:'Home Depot', sector:'Consumer Cyclical', industry:'Home Improvement', cap:400 },
  { ticker:'MCD', name:'McDonalds', sector:'Consumer Cyclical', industry:'Restaurants', cap:210 },
  { ticker:'NKE', name:'Nike', sector:'Consumer Cyclical', industry:'Apparel', cap:120 },
  // Financials
  { ticker:'BRK-B', name:'Berkshire Hathaway', sector:'Financials', industry:'Insurance', cap:900 },
  { ticker:'JPM', name:'JPMorgan Chase', sector:'Financials', industry:'Banks', cap:650 },
  { ticker:'V', name:'Visa', sector:'Financials', industry:'Credit Services', cap:550 },
  { ticker:'MA', name:'Mastercard', sector:'Financials', industry:'Credit Services', cap:450 },
  { ticker:'BAC', name:'Bank of America', sector:'Financials', industry:'Banks', cap:330 },
  // Healthcare
  { ticker:'LLY', name:'Eli Lilly', sector:'Healthcare', industry:'Drug Manufacturers', cap:800 },
  { ticker:'UNH', name:'UnitedHealth', sector:'Healthcare', industry:'Healthcare Plans', cap:500 },
  { ticker:'JNJ', name:'Johnson & Johnson', sector:'Healthcare', industry:'Drug Manufacturers', cap:380 },
  { ticker:'ABBV', name:'AbbVie', sector:'Healthcare', industry:'Drug Manufacturers', cap:330 },
  { ticker:'MRK', name:'Merck', sector:'Healthcare', industry:'Drug Manufacturers', cap:250 },
  // Consumer Defensive
  { ticker:'WMT', name:'Walmart', sector:'Consumer Defensive', industry:'Discount Stores', cap:600 },
  { ticker:'COST', name:'Costco', sector:'Consumer Defensive', industry:'Discount Stores', cap:400 },
  { ticker:'PG', name:'Procter & Gamble', sector:'Consumer Defensive', industry:'Household Products', cap:390 },
  { ticker:'KO', name:'Coca-Cola', sector:'Consumer Defensive', industry:'Beverages', cap:290 },
  { ticker:'PEP', name:'PepsiCo', sector:'Consumer Defensive', industry:'Beverages', cap:230 },
  // Energy
  { ticker:'XOM', name:'Exxon Mobil', sector:'Energy', industry:'Oil & Gas', cap:500 },
  { ticker:'CVX', name:'Chevron', sector:'Energy', industry:'Oil & Gas', cap:280 },
  // Industrials
  { ticker:'CAT', name:'Caterpillar', sector:'Industrials', industry:'Machinery', cap:180 },
  { ticker:'GE', name:'GE Aerospace', sector:'Industrials', industry:'Aerospace & Defense', cap:190 },
  { ticker:'RTX', name:'RTX', sector:'Industrials', industry:'Aerospace & Defense', cap:160 },
  { ticker:'HON', name:'Honeywell', sector:'Industrials', industry:'Conglomerates', cap:140 },
  // Utilities
  { ticker:'NEE', name:'NextEra Energy', sector:'Utilities', industry:'Utilities', cap:160 },
  { ticker:'DUK', name:'Duke Energy', sector:'Utilities', industry:'Utilities', cap:90 },
  // Basic Materials
  { ticker:'LIN', name:'Linde', sector:'Basic Materials', industry:'Specialty Chemicals', cap:220 },
  { ticker:'SHW', name:'Sherwin-Williams', sector:'Basic Materials', industry:'Specialty Chemicals', cap:90 },
  // Real Estate
  { ticker:'PLD', name:'Prologis', sector:'Real Estate', industry:'REIT', cap:110 },
  { ticker:'AMT', name:'American Tower', sector:'Real Estate', industry:'REIT', cap:100 },
];

// Variación DIARIA real: último cierre vs cierre anterior (de los puntos diarios).
// OJO: meta.chartPreviousClose en ventana 5d es de hace ~5 sesiones (multi-día);
// meta.previousClose viene vacío en el endpoint chart. Por eso usamos los cierres.
function dailyChange(points, meta) {
  const closes = points.map(p => p.close);
  const price = meta.regularMarketPrice ?? closes[closes.length - 1] ?? null;
  const prev = closes.length >= 2 ? closes[closes.length - 2] : (meta.chartPreviousClose ?? null);
  const change = (price != null && prev) ? +(((price - prev) / prev) * 100).toFixed(2) : 0;
  return { price: price != null ? +Number(price).toFixed(2) : null, prev, change };
}

let mmCache = { ts: 0, data: null };
export async function getMarketMap() {
  if (mmCache.data && Date.now() - mmCache.ts < 15 * 60 * 1000) return mmCache.data;

  const out = await Promise.all(MARKET_BASKET.map(async (s) => {
    try {
      const { points, meta } = await fetchChart(yahooSymbol(s.ticker), '5d', '1d');
      const { price, change } = dailyChange(points, meta);
      return { ...s, price, changePercent: change, live: true };
    } catch (e) {
      return { ...s, price: null, changePercent: 0, live: false };
    }
  }));

  mmCache = { ts: Date.now(), data: out };
  return out;
}

// Cotización puntual en tiempo real de un símbolo cualquiera
export async function getQuote(symbol) {
  const { points, meta } = await fetchChart(yahooSymbol(symbol), '5d', '1d');
  const { price, prev, change } = dailyChange(points, meta);
  return {
    symbol: meta.symbol || symbol,
    price,
    previousClose: prev,
    changePercent: change,
    currency: meta.currency || null,
  };
}

// Cotización en lote (para refrescar toda la cartera). Tolera fallos por símbolo.
export async function getQuotes(symbols) {
  return Promise.all(symbols.map(async (s) => {
    try {
      const { points, meta } = await fetchChart(yahooSymbol(s), '5d', '1d');
      const { price, prev, change } = dailyChange(points, meta);
      return { symbol: s, price, previousClose: prev, changePercent: change };
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
