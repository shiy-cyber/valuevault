// Helpers de formato y color de métricas (portados del HTML original)

export function fmt(v, suffix = '') {
  return (v === null || v === undefined || v === '' || isNaN(v))
    ? '—'
    : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + suffix;
}
export function fmtM(v) {
  if (!v || v === 'None') return '—';
  return v;
}
export function getRiskW(r) { return r === 'low' ? 28 : r === 'medium' ? 58 : 88; }
export function riskLabel(r) { return r === 'low' ? 'Bajo' : r === 'medium' ? 'Medio' : 'Alto'; }
export function riskColor(r) { return r === 'low' ? 'var(--green)' : r === 'medium' ? 'var(--orange)' : 'var(--red)'; }

export function metricColor(key, val) {
  if (val === null || val === undefined || val === '' || isNaN(val)) return '';
  const v = parseFloat(val);
  const rules = { roe:[15,8], roa:[10,5], gm:[40,20], om:[20,10], nm:[15,8], cr:[1.5,1], qr:[1,0.7], dy:[3,1], peg:[1,2] };
  if (key === 'de')   return v < 1 ? 'good' : v < 2 ? 'warn' : 'bad';
  if (key === 'beta') return v < 1 ? 'good' : v < 1.5 ? 'warn' : 'bad';
  if (rules[key]) { const [good, warn] = rules[key]; if (v >= good) return 'good'; if (v >= warn) return 'warn'; return 'bad'; }
  return '';
}

// Color directo (para estilos inline en el panel expandible)
export function mvColor(val, good, warn) {
  const v = parseFloat(val);
  const empty = val === null || val === undefined || val === '' || isNaN(v);
  if (empty) return 'var(--muted)';
  if (good && v >= good) return 'var(--green)';
  if (warn && v >= warn) return 'var(--orange)';
  if (good) return 'var(--red)';
  return 'var(--text)';
}

export function changePct(a) {
  const chg = a.price > 0 ? ((a.current - a.price) / a.price * 100) : 0;
  return chg;
}

// ─────────────────────────────────────────────────────────────
// P&L de cartera ponderado por tamaño y normalizado a divisa base (EUR).
// fxRates: { EUR:1, USD:0.92, … } = cuántos EUR vale 1 ud. de cada divisa.
// Separa el retorno del ACTIVO (en divisa local, exacto) del retorno de
// DIVISA (sólo si se guardó fxEntry en la compra).
// ─────────────────────────────────────────────────────────────
export const BASE_CCY = 'EUR';

const fxOf = (rates, ccy) => (rates && rates[(ccy || 'USD').toUpperCase()]) || (ccy && ccy.toUpperCase() === BASE_CCY ? 1 : null);

// Métricas de una posición. Devuelve null si no se puede valorar (sin tamaño/FX).
export function positionMetrics(a, fxRates = {}) {
  const fxNow = fxOf(fxRates, a.currency);
  const assetRet = a.price > 0 ? (a.current - a.price) / a.price : null; // local, exacto
  const sized = a.shares > 0 && a.price > 0 && fxNow != null;
  if (!sized) return { sized: false, assetRet };
  const valueBase = a.shares * a.current * fxNow;
  const fxEntry = a.fxEntry > 0 ? a.fxEntry : fxNow;          // sin fxEntry → sin efecto divisa
  const costBase = a.shares * a.price * fxEntry;
  const curRet = a.fxEntry > 0 ? (fxNow / fxEntry - 1) : null; // retorno divisa
  return {
    sized: true, assetRet, curRet, valueBase, costBase,
    pnlBase: valueBase - costBase,
    totalRet: costBase > 0 ? (valueBase - costBase) / costBase : null,
  };
}

// Estadísticas agregadas de la cartera (ponderadas por valor en EUR)
export function portfolioStats(assets, fxRates = {}) {
  let valueBase = 0, costBase = 0, sized = 0, unsized = 0, curW = 0, curWeight = 0;
  for (const a of assets) {
    const m = positionMetrics(a, fxRates);
    if (!m.sized) { unsized++; continue; }
    sized++;
    valueBase += m.valueBase;
    costBase += m.costBase;
    if (m.curRet != null) { curW += m.curRet * m.valueBase; curWeight += m.valueBase; }
  }
  return {
    sized, unsized,
    valueBase: sized ? valueBase : null,
    costBase: sized ? costBase : null,
    pnlBase: sized ? valueBase - costBase : null,
    returnPct: sized && costBase > 0 ? (valueBase - costBase) / costBase * 100 : null,
    currencyPct: curWeight > 0 ? curW / curWeight * 100 : null, // efecto divisa ponderado
  };
}

// Pesos de cartera (suman 1) por valor en EUR. Si nadie tiene tamaño, reparte
// a partes iguales. Devuelve array alineado con `assets`.
export function portfolioWeights(assets, fxRates = {}) {
  const vals = assets.map(a => { const m = positionMetrics(a, fxRates); return m.sized ? m.valueBase : 0; });
  const total = vals.reduce((s, x) => s + x, 0);
  if (total > 0) return { weights: vals.map(v => v / total), byValue: true };
  const n = assets.length || 1;
  return { weights: assets.map(() => 1 / n), byValue: false };
}

// Volatilidad de cartera vía matriz de covarianzas: σp = √(wᵀ Σ w),
// con Σ_ij = corr_ij · vol_i · vol_j. vols/corr de /api/risk; pesos por €.
// corr null (muestra insuficiente) → se trata como 0.
export function portfolioVol(weights, vols, corr) {
  let varSum = 0;
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      const vi = vols[i], vj = vols[j];
      if (vi == null || vj == null) continue;
      const c = i === j ? 1 : (corr?.[i]?.[j] ?? 0);
      varSum += weights[i] * weights[j] * (vi / 100) * (vj / 100) * c;
    }
  }
  return varSum > 0 ? +(Math.sqrt(varSum) * 100).toFixed(1) : null;
}

// Correlación media entre pares (off-diagonal, ignorando nulls)
export function avgCorrelation(corr) {
  let sum = 0, n = 0;
  for (let i = 0; i < corr.length; i++)
    for (let j = i + 1; j < corr.length; j++)
      if (corr[i][j] != null) { sum += corr[i][j]; n++; }
  return n ? +(sum / n).toFixed(2) : null;
}

// Color para celdas de correlación (alta = rojo, baja/negativa = verde)
export function corrColor(c) {
  if (c == null) return 'var(--border)';
  if (c >= 0.7) return 'rgba(231,76,60,.38)';
  if (c >= 0.4) return 'rgba(230,126,34,.32)';
  if (c >= 0.1) return 'rgba(241,196,15,.22)';
  return 'rgba(46,204,113,.30)';
}

// Formatea importe en divisa base (EUR) de forma compacta
export function fmtBase(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const abs = Math.abs(v);
  const s = abs >= 1000 ? Number(v).toLocaleString('es-ES', { maximumFractionDigits: 0 })
                        : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 });
  return s + ' €';
}

// P&L medio de una cartera (compat.: media simple de cambios %, sin ponderar)
export function avgPnl(assets) {
  const valid = assets.filter(a => a.price > 0);
  if (!valid.length) return null;
  return valid.reduce((s, a) => s + changePct(a), 0) / valid.length;
}

// ─────────────────────────────────────────────────────────────
// SCORE COMPUESTO 0-100 por pilares: Valor · Calidad · Momentum.
// Convierte ~24 ratios sueltos en 3 decisiones. Sólo promedia métricas
// con dato; un pilar sin datos devuelve null (no penaliza). El pilar
// Momentum es un PROXY (posición en rango 52s + crecimiento EPS): sin
// fuerza relativa vs índice real, declararlo así en la UI.
// ─────────────────────────────────────────────────────────────
// sub(valor, dir, bueno, medio) → 100 / 60 / 25 (null si sin dato)
function sub(value, dir, good, mid) {
  if (value === null || value === undefined || value === '' || isNaN(value)) return null;
  const v = +value;
  if (dir === 'high') return v >= good ? 100 : v >= mid ? 60 : 25;
  return v <= good ? 100 : v <= mid ? 60 : 25;
}
const avg = (xs) => { const v = xs.filter(x => x !== null); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null; };

export function compositeScore(a) {
  const value = avg([
    sub(a.pe, 'low', 15, 25), sub(a.fpe, 'low', 14, 22), sub(a.pb, 'low', 2, 4),
    sub(a.ps, 'low', 2, 5), sub(a.peg, 'low', 1, 2), sub(a.evebitda, 'low', 10, 16),
    sub(a.dy, 'high', 3, 1.5), sub(a.fcfy, 'high', 5, 3), // FCF yield (P1.3)
  ]);
  // Spread ROIC−WACC: >0 = el negocio crea valor (P1.3)
  const spread = (a.roic != null && a.wacc != null) ? a.roic - a.wacc : null;
  const quality = avg([
    sub(a.roe, 'high', 15, 8), sub(a.roa, 'high', 10, 5), sub(a.gm, 'high', 40, 20),
    sub(a.om, 'high', 20, 10), sub(a.nm, 'high', 15, 8), sub(a.de, 'low', 1, 2),
    sub(a.cr, 'high', 1.5, 1), sub(a.qr, 'high', 1, 0.7),
    sub(a.roic, 'high', 15, 8), sub(spread, 'high', 5, 0), // ROIC y creación de valor (P1.3)
  ]);
  // Posición en el rango de 52 semanas (0..1): cerca de máximos = momentum alto
  let pos52 = null;
  if (a.w52h > a.w52l && a.current > 0) pos52 = (a.current - a.w52l) / (a.w52h - a.w52l) * 100;
  const momentum = avg([
    sub(pos52, 'high', 70, 40), sub(a.epsg, 'high', 12, 5),
    sub(a.epsRev, 'high', 2, 0), // revisión de estimaciones EPS (P1.4): >0 = al alza
  ]);
  const total = avg([value, quality, momentum]);
  return { value, quality, momentum, total };
}

// "hace 3 min" a partir de un ISO timestamp
export function timeAgo(iso) {
  if (!iso) return null;
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'hace segundos';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

// Tags de estrategia + horizonte
const STRAT_MAP = { value:['tag-value','Value'], growth:['tag-growth','Growth'], dividend:['tag-dividend','Dividend'], momentum:['tag-momentum','Momentum'], garp:['tag-garp','GARP'], hidden:['tag-hidden','Gema'] };
const TIME_MAP = { short:['tag-sp','Corto'], medium:['tag-mp','Medio'], long:['tag-lp','Largo'] };
export function tagList(strategies = [], time = []) {
  const out = [];
  strategies.forEach(s => { if (STRAT_MAP[s]) out.push({ cls: STRAT_MAP[s][0], label: STRAT_MAP[s][1] }); });
  time.forEach(t => { if (TIME_MAP[t]) out.push({ cls: TIME_MAP[t][0], label: TIME_MAP[t][1] }); });
  return out;
}

export const TOPIC_MAP = { value:'Value Investing', growth:'Growth', analysis:'Análisis', macro:'Macro', psychology:'Psicología', strategy:'Estrategia' };
export const TOPIC_SHORT = { value:'Value', growth:'Growth', analysis:'Análisis', macro:'Macro', psychology:'Psicología', strategy:'Estrategia' };

export function insiderLinks(ticker) {
  return [
    { label:'📋 OpenInsider', url:`https://openinsider.com/search?q=${ticker}` },
    { label:'🐋 WhaleWisdom', url:`https://whalewisdom.com/stock/${ticker}` },
    { label:'📊 Finviz', url:`https://finviz.com/quote.ashx?t=${ticker}` },
    { label:'🏛 SEC EDGAR', url:`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${ticker}&type=4&dateb=&owner=include&count=20` },
  ];
}
