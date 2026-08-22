// ─── Fuentes Macro Research (36) ─────────────────────────────
// name/desc/tag se resuelven via i18next: macroPage.sources.<key>.{name,desc,tag}
export const MACRO_SOURCES = [
  { key:'fed', url:'https://www.federalreserve.gov', cat:'central-banks', icon:'🏛' },
  { key:'fred', url:'https://fred.stlouisfed.org', cat:'central-banks', icon:'📊' },
  { key:'ecb', url:'https://www.ecb.europa.eu', cat:'central-banks', icon:'🏛' },
  { key:'boe', url:'https://www.bankofengland.co.uk', cat:'central-banks', icon:'🏛' },
  { key:'boj', url:'https://www.boj.or.jp/en', cat:'central-banks', icon:'🏛' },
  { key:'bis', url:'https://www.bis.org', cat:'central-banks', icon:'🏛' },

  { key:'tradingeconomics', url:'https://tradingeconomics.com', cat:'data', icon:'📈' },
  { key:'bls', url:'https://www.bls.gov', cat:'data', icon:'📋' },
  { key:'bea', url:'https://www.bea.gov', cat:'data', icon:'📋' },
  { key:'imf', url:'https://www.imf.org/en/Data', cat:'data', icon:'🌐' },
  { key:'oecd', url:'https://data.oecd.org', cat:'data', icon:'📊' },
  { key:'eurostat', url:'https://ec.europa.eu/eurostat', cat:'data', icon:'🇪🇺' },
  { key:'worldbank', url:'https://data.worldbank.org', cat:'data', icon:'🌍' },

  { key:'tradingview', url:'https://www.tradingview.com', cat:'markets', icon:'📉' },
  { key:'investing', url:'https://www.investing.com', cat:'markets', icon:'📅' },
  { key:'ustreasury', url:'https://home.treasury.gov/resource-center/data-chart-center/interest-rates', cat:'markets', icon:'📐' },
  { key:'vix', url:'https://www.cboe.com/tradable_products/vix', cat:'markets', icon:'😨' },
  { key:'shillercape', url:'https://www.multpl.com/shiller-pe', cat:'markets', icon:'🎯' },
  { key:'feargreed', url:'https://edition.cnn.com/markets/fear-and-greed', cat:'markets', icon:'📡' },
  { key:'finvizfutures', url:'https://finviz.com/futures.ashx', cat:'markets', icon:'🗺' },

  { key:'oilprice', url:'https://oilprice.com', cat:'commodities', icon:'🛢' },
  { key:'goldcouncil', url:'https://www.gold.org/goldhub/data/gold-prices', cat:'commodities', icon:'🥇' },
  { key:'eia', url:'https://www.eia.gov', cat:'commodities', icon:'⚡' },
  { key:'lme', url:'https://www.lme.com/Metals', cat:'commodities', icon:'⚙️' },
  { key:'cme', url:'https://www.cmegroup.com/markets/commodities.html', cat:'commodities', icon:'📦' },

  { key:'ft', url:'https://www.ft.com', cat:'geopolitics', icon:'📰' },
  { key:'economist', url:'https://www.economist.com', cat:'geopolitics', icon:'📰' },
  { key:'cfr', url:'https://www.cfr.org', cat:'geopolitics', icon:'🌐' },
  { key:'stratfor', url:'https://worldview.stratfor.com', cat:'geopolitics', icon:'🗺' },
  { key:'aonrisk', url:'https://www.aon.com/risk-services/political-risk-map.jsp', cat:'geopolitics', icon:'🗺' },

  { key:'damodaran', url:'https://pages.stern.nyu.edu/~adamodar', cat:'research', icon:'🎓' },
  { key:'oaktree', url:'https://www.oaktreecapital.com/insights/memo', cat:'research', icon:'📄' },
  { key:'gmo', url:'https://www.gmo.com/americas/research-library', cat:'research', icon:'📄' },
  { key:'raydalio', url:'https://www.principles.com', cat:'research', icon:'📄' },
  { key:'researchaffiliates', url:'https://www.researchaffiliates.com', cat:'research', icon:'🔬' },
  { key:'nber', url:'https://www.nber.org/research/business-cycle-dating', cat:'research', icon:'🎓' },
];

// label se resuelve via i18next: macroPage.cats.<key>
export const MACRO_CATS = [
  { key:'all' },
  { key:'central-banks' },
  { key:'data' },
  { key:'markets' },
  { key:'commodities' },
  { key:'geopolitics' },
  { key:'research' },
];

// ─── Opciones del Stock Screener ─────────────────────────────
// Los valores de sector/país son literales enviados a Finviz/StockAnalysis
// (no se traducen). Las etiquetas mostradas se resuelven via i18next en
// Screener.jsx (namespace screenerPage) — aqui solo quedan los value-keys.
export const SC_SECTORS = ['','Technology','Healthcare','Financial','Energy','Consumer Cyclical','Consumer Defensive','Industrials','Utilities','Real Estate','Basic Materials','Communication Services'];
export const SC_SECTOR_LABELS = { 'Financial':'Financials' };
export const SC_CAP = [['','',''],['mega','Mega','(+200B)'],['large','Large','(10B-200B)'],['mid','Mid','(2B-10B)'],['small','Small','(300M-2B)'],['micro','Micro','(-300M)']];
export const SC_PE = ['','u5','u10','u15','u20','u25','u30','u40','u50'];
export const SC_PB = ['','u1','u2','u3','u5','u10'];
export const SC_DIV = ['','o1','o2','o3','o4','o5','o6'];
export const SC_ROE = ['','o10','o15','o20','o25','o30'];
export const SC_COUNTRY = ['','USA','Europe','Spain','Germany','UK','Japan','China'];
export const SC_STRAT = ['','value','growth','dividend','momentum'];
// Ampliación (2026-08): Forward P/E, PEG, EV/EBITDA, crecimiento EPS, Debt/Eq, RECOM y márgenes.
export const SC_FPE = ['','u5','u10','u15','u20','u25','u30','u40','u50'];
export const SC_PEG = ['','low','u1','u2','u3'];
export const SC_EVEBITDA = ['','u5','u10','u15','u20','u25','u30'];
export const SC_EPS_NEXTY = ['','o5','o10','o15','o20','o25','o30'];
export const SC_EPS_5Y = ['','o5','o10','o15','o20','o25','o30'];
export const SC_DEBTEQ = ['','u0.1','u0.3','u0.5','u1','o0.5','o1'];
export const SC_RECOM = ['','strongbuy','buybetter','buy','holdbetter','hold','holdworse','sell','sellworse','strongsell'];
export const SC_GROSSMARGIN = ['','o20','o30','o40','o50','o60'];
export const SC_OPERMARGIN = ['','o10','o15','o20','o25','o30'];
export const SC_NETMARGIN = ['','o5','o10','o15','o20','o25','o30'];

// ─── Constructores de URL de screeners externos ─────────────
export function buildFinvizFilters(f) {
  const filters = [];
  if (f.sector)  filters.push('sec_' + f.sector.replace(/ /g, '%20'));
  if (f.cap)     { const m = { mega:'cap_mega', large:'cap_largeover', mid:'cap_mid', small:'cap_small', micro:'cap_micro' }; if (m[f.cap]) filters.push(m[f.cap]); }
  if (f.pe)      filters.push('fa_pe_' + f.pe);
  if (f.pb)      filters.push('fa_pb_' + f.pb);
  if (f.div)     filters.push('fa_div_' + f.div);
  if (f.roe)     filters.push('fa_roe_' + f.roe);
  if (f.fpe)          filters.push('fa_fpe_' + f.fpe);
  if (f.peg)          filters.push('fa_peg_' + f.peg);
  if (f.evebitda)     filters.push('fa_evebitda_' + f.evebitda);
  if (f.epsNextY)      filters.push('fa_epsyoy1_' + f.epsNextY);
  if (f.eps5y)         filters.push('fa_estltgrowth_' + f.eps5y);
  if (f.debteq)       filters.push('fa_debteq_' + f.debteq);
  if (f.recom)        filters.push('an_recom_' + f.recom);
  if (f.grossmargin)  filters.push('fa_grossmargin_' + f.grossmargin);
  if (f.opermargin)   filters.push('fa_opermargin_' + f.opermargin);
  if (f.netmargin)    filters.push('fa_netmargin_' + f.netmargin);
  if (f.country) filters.push('geo_' + f.country.replace(/ /g, '%20'));
  if (f.strat === 'value')    filters.push('fa_pe_u15', 'fa_pb_u2');
  if (f.strat === 'growth')   filters.push('fa_epsqoq_o15', 'fa_salesqoq_o10');
  if (f.strat === 'dividend') filters.push('fa_div_o3', 'fa_payout_u80');
  if (f.strat === 'momentum') filters.push('ta_perf_1w_o5');
  return filters;
}
export function finvizURL(f) {
  const filters = buildFinvizFilters(f);
  const base = 'https://finviz.com/screener.ashx?v=111';
  return filters.length ? base + '&f=' + filters.join(',') : base;
}
export function stockAnalysisURL(f) {
  const base = 'https://stockanalysis.com/stocks/screener/';
  const params = [];
  if (f.sector) params.push('sector=' + encodeURIComponent(f.sector));
  if (f.pe)  { const m = { u5:5, u10:10, u15:15, u20:20, u25:25, u30:30, u40:40, u50:50 }; if (m[f.pe]) params.push('pe-max=' + m[f.pe]); }
  if (f.div) { const m = { o1:1, o2:2, o3:3, o4:4, o5:5, o6:6 }; if (m[f.div]) params.push('dividendYield-min=' + m[f.div]); }
  return base + (params.length ? '?' + params.join('&') : '');
}
export const yahooScreenerURL = 'https://finance.yahoo.com/screener/new';

// ─── Herramientas complementarias del screener ──────────────
// desc se resuelve via i18next: screenerPage.tools.<key>
export const SCREENER_TOOLS = [
  { url:'https://openinsider.com', icon:'📋', name:'OpenInsider', key:'openinsider' },
  { url:'https://whalewisdom.com', icon:'🐋', name:'WhaleWisdom', key:'whalewisdom' },
  { url:'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=4&dateb=&owner=include&count=20', icon:'🏛', name:'SEC EDGAR', key:'secedgar' },
  { url:'https://simplywall.st/stocks', icon:'🧱', name:'Simply Wall St', key:'simplywallst' },
  { url:'https://stockanalysis.com/stocks/screener/', icon:'🔎', name:'Stock Analysis', key:'stockanalysis' },
  { url:'https://www.macrotrends.net', icon:'📉', name:'Macrotrends', key:'macrotrends' },
];

// ─── Navegación ──────────────────────────────────────────────
// Los textos (section/label) se resuelven via i18next en App.jsx
// (t('navSection.<key>') / t('nav.<id>')) — aqui solo estructura e ids.
export const NAV = [
  { section:'principal' },
  { id:'dashboard', icon:'◈' },
  { section:'activos' },
  { id:'assets', icon:'◆' },
  { id:'watchlist', icon:'★' },
  { id:'compare', icon:'⇄' },
  { id:'charts', icon:'◎' },
  { id:'screener', icon:'⊞' },
  { id:'valuation', icon:'🧮' },
  { id:'volprofile', icon:'📊' },
  { id:'smc', icon:'⚡' },
  { id:'gamma', icon:'γ' },
  { id:'trendfollow', icon:'📈' },
  { section:'comunidad' },
  { id:'community', icon:'🗣' },
  { id:'thesis', icon:'📄' },
  { section:'conocimiento' },
  { id:'learning', icon:'📖' },
  { id:'trends', icon:'📡' },
  { id:'indices', icon:'🌎' },
  { id:'sentiment', icon:'🧭' },
  { id:'marketmap', icon:'🗺' },
  { id:'macro', icon:'🌐' },
  { section:'info' },
  { id:'about', icon:'ℹ️' },
];
