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

// P&L medio de una cartera (media de los cambios % con precio de entrada > 0)
export function avgPnl(assets) {
  const valid = assets.filter(a => a.price > 0);
  if (!valid.length) return null;
  return valid.reduce((s, a) => s + changePct(a), 0) / valid.length;
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
