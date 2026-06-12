// ─────────────────────────────────────────────────────────────
// Sentimiento de mercado. Agrega 3 fuentes públicas gratuitas:
//   · CNN Fear & Greed  → índice 0-100 + 7 componentes + histórico 1 año
//     (incluye Amplitud/Breadth y Put-Call, que el usuario pidió aparte)
//   · Crypto Fear & Greed (alternative.me) → 0-100 + histórico 30 días
//   · VIX (Yahoo) → nivel actual + variación + histórico 1 mes
// Tolerante a fallos por fuente (Promise.allSettled). Cache 10 min.
// ─────────────────────────────────────────────────────────────
import { fetchChart } from './sectors.js';

const CNN_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';
// CNN bloquea (HTTP 418) sin cabeceras de navegador completas.
const CNN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://edition.cnn.com/markets/fear-and-greed',
};
const CRYPTO_URL = 'https://api.alternative.me/fng/?limit=30';

// Los 7 componentes que CNN usa para el índice (con etiqueta/descr. en ES)
const COMPONENTS = [
  { key: 'market_momentum_sp125', label: 'Momentum del mercado', desc: 'S&P 500 frente a su media de 125 días' },
  { key: 'stock_price_strength',  label: 'Fuerza del precio',     desc: 'Máximos vs mínimos de 52 semanas en NYSE' },
  { key: 'stock_price_breadth',   label: 'Amplitud del mercado',  desc: 'Volumen al alza vs a la baja (McClellan)' },
  { key: 'put_call_options',      label: 'Opciones Put / Call',   desc: 'Ratio put/call de opciones a 5 días' },
  { key: 'market_volatility_vix', label: 'Volatilidad (VIX)',     desc: 'VIX frente a su media de 50 días' },
  { key: 'safe_haven_demand',     label: 'Demanda de refugio',    desc: 'Rentabilidad acciones vs bonos (20 días)' },
  { key: 'junk_bond_demand',      label: 'Bono basura',           desc: 'Spread de deuda high yield' },
];

const num = (v) => (v != null && !Number.isNaN(Number(v))) ? +Number(v).toFixed(1) : null;

async function getCNN() {
  const r = await fetch(CNN_URL, { headers: CNN_HEADERS });
  if (!r.ok) throw new Error(`CNN HTTP ${r.status}`);
  const j = await r.json();
  const fg = j.fear_and_greed || {};
  const history = (j.fear_and_greed_historical?.data || [])
    .map(d => ({ t: Math.round(d.x), score: num(d.y) }))
    .filter(d => d.score != null);
  const components = COMPONENTS.map(c => {
    const o = j[c.key] || {};
    return { key: c.key, label: c.label, desc: c.desc, score: num(o.score), rating: o.rating || null };
  });
  return {
    score: num(fg.score),
    rating: fg.rating || null,
    prev: {
      close: num(fg.previous_close),
      week:  num(fg.previous_1_week),
      month: num(fg.previous_1_month),
      year:  num(fg.previous_1_year),
    },
    components,
    history,
  };
}

async function getCrypto() {
  const r = await fetch(CRYPTO_URL, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Crypto HTTP ${r.status}`);
  const j = await r.json();
  const data = (j.data || [])
    .map(d => ({ t: Number(d.timestamp) * 1000, value: Number(d.value), cls: d.value_classification }))
    .sort((a, b) => a.t - b.t);
  const cur = data[data.length - 1];
  return {
    value: cur?.value ?? null,
    classification: cur?.cls ?? null,
    history: data.map(d => ({ t: d.t, value: d.value })),
  };
}

async function getVix() {
  const { points, meta } = await fetchChart('^VIX', '1mo', '1d');
  const closes = points.map(p => p.close);
  if (!closes.length) throw new Error('VIX sin datos');
  const price = meta.regularMarketPrice ?? closes[closes.length - 1];
  const prev = closes.length >= 2 ? closes[closes.length - 2] : null;
  const changePercent = (price != null && prev) ? +(((price - prev) / prev) * 100).toFixed(2) : 0;
  return {
    value: price != null ? +Number(price).toFixed(2) : null,
    changePercent,
    history: points.map(p => ({ t: p.t, close: +p.close.toFixed(2) })),
  };
}

let cache = { ts: 0, data: null };
const TTL = 10 * 60 * 1000;

export async function getSentiment(force = false) {
  if (!force && cache.data && Date.now() - cache.ts < TTL) return cache.data;

  const [cnn, crypto, vix] = await Promise.allSettled([getCNN(), getCrypto(), getVix()]);
  const err = (s) => s.status === 'rejected' ? String(s.reason?.message || s.reason) : null;

  const data = {
    cnn:    cnn.status === 'fulfilled' ? cnn.value : null,
    crypto: crypto.status === 'fulfilled' ? crypto.value : null,
    vix:    vix.status === 'fulfilled' ? vix.value : null,
    at: new Date().toISOString(),
    errors: { cnn: err(cnn), crypto: err(crypto), vix: err(vix) },
  };
  cache = { ts: Date.now(), data };
  return data;
}
