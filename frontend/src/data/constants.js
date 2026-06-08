// ─── Fuentes Macro Research (37) ─────────────────────────────
export const MACRO_SOURCES = [
  { name:'Federal Reserve (Fed)', url:'https://www.federalreserve.gov', desc:'Decisiones de tipos, actas FOMC, proyecciones económicas y balance. La fuente más influyente del mundo.', cat:'central-banks', icon:'🏛', tag:'Fed · USA' },
  { name:'Fed St. Louis — FRED', url:'https://fred.stlouisfed.org', desc:'Base de datos económica más completa del mundo. 800.000+ series: PIB, inflación, empleo, tipos, yield curve.', cat:'central-banks', icon:'📊', tag:'FRED · USA' },
  { name:'Banco Central Europeo (BCE)', url:'https://www.ecb.europa.eu', desc:'Política monetaria eurozona, tipos de referencia, inflación UE y comunicados oficiales.', cat:'central-banks', icon:'🏛', tag:'BCE · Europa' },
  { name:'Bank of England (BoE)', url:'https://www.bankofengland.co.uk', desc:'Tipos UK, inflation report y decisiones del MPC. Referencia para libra esterlina y ciclo británico.', cat:'central-banks', icon:'🏛', tag:'BoE · UK' },
  { name:'Bank of Japan (BoJ)', url:'https://www.boj.or.jp/en', desc:'Control de curva de tipos y política ultra-expansiva. Clave para yen y carry trade global.', cat:'central-banks', icon:'🏛', tag:'BoJ · Japón' },
  { name:'BIS — Bank for Int. Settlements', url:'https://www.bis.org', desc:'El banco de los bancos centrales. Informes trimestrales sobre estabilidad financiera global.', cat:'central-banks', icon:'🏛', tag:'BIS · Global' },

  { name:'Trading Economics', url:'https://tradingeconomics.com', desc:'Datos macroeconómicos de 196 países: PIB, inflación, desempleo, balanza comercial. Actualización en tiempo real.', cat:'data', icon:'📈', tag:'Global · Tiempo Real' },
  { name:'US Bureau of Labor Statistics', url:'https://www.bls.gov', desc:'CPI, PPI, NFP (nóminas), tasa de desempleo USA. Los datos que más mueven al mercado cada mes.', cat:'data', icon:'📋', tag:'BLS · USA' },
  { name:'US Bureau of Economic Analysis', url:'https://www.bea.gov', desc:'PIB USA, ingresos personales, balanza de pagos. Datos fundamentales para valorar el ciclo americano.', cat:'data', icon:'📋', tag:'BEA · USA' },
  { name:'IMF — World Economic Outlook', url:'https://www.imf.org/en/Data', desc:'Perspectivas macroeconómicas globales semestrales del FMI. Global Financial Stability Report.', cat:'data', icon:'🌐', tag:'FMI · Global' },
  { name:'OCDE Data', url:'https://data.oecd.org', desc:'Estadísticas de países desarrollados. Comparativas de productividad, deuda, comercio y bienestar.', cat:'data', icon:'📊', tag:'OCDE · Desarrollados' },
  { name:'Eurostat', url:'https://ec.europa.eu/eurostat', desc:'Estadísticas oficiales de la UE. Inflación HICP, PIB eurozona, desempleo y comercio exterior.', cat:'data', icon:'🇪🇺', tag:'Eurostat · UE' },
  { name:'World Bank Open Data', url:'https://data.worldbank.org', desc:'Datos de desarrollo económico global. Esencial para mercados emergentes y deuda externa.', cat:'data', icon:'🌍', tag:'Banco Mundial · Global' },

  { name:'TradingView', url:'https://www.tradingview.com', desc:'Gráficos profesionales de índices, bonos, divisas y commodities. El mejor para análisis técnico macro.', cat:'markets', icon:'📉', tag:'Mercados · Global' },
  { name:'Investing.com', url:'https://www.investing.com', desc:'Calendario económico, tipos por país, índices globales, bonos soberanos y divisas en tiempo real.', cat:'markets', icon:'📅', tag:'Mercados · Global' },
  { name:'US Treasury Yields', url:'https://home.treasury.gov/resource-center/data-chart-center/interest-rates', desc:'Curva de tipos del Tesoro americano. La yield curve invertida como predictor de recesión.', cat:'markets', icon:'📐', tag:'Treasuries · USA' },
  { name:'CBOE — VIX', url:'https://www.cboe.com/tradable_products/vix', desc:'Índice del miedo. Volatilidad implícita del S&P 500. Termómetro del sentimiento de mercado.', cat:'markets', icon:'😨', tag:'VIX · USA' },
  { name:'Shiller CAPE Ratio', url:'https://www.multpl.com/shiller-pe', desc:'Valoración histórica del S&P 500 desde 1880. El indicador de valoración macro más seguido del mundo.', cat:'markets', icon:'🎯', tag:'Valoración · USA' },
  { name:'CNN Fear & Greed Index', url:'https://edition.cnn.com/markets/fear-and-greed', desc:'Índice de sentimiento: miedo extremo vs codicia extrema. Útil como indicador contrarian.', cat:'markets', icon:'📡', tag:'Sentimiento · USA' },
  { name:'Finviz Futures & Forex', url:'https://finviz.com/futures.ashx', desc:'Futuros de índices, commodities y divisas en tiempo real. Mapa de calor global al abrir cada sesión.', cat:'markets', icon:'🗺', tag:'Futuros · Global' },

  { name:'Oil Price', url:'https://oilprice.com', desc:'Precios del petróleo Brent y WTI, inventarios EIA y geopolítica del crudo. Referencia diaria.', cat:'commodities', icon:'🛢', tag:'Petróleo · Global' },
  { name:'World Gold Council', url:'https://www.gold.org/goldhub/data/gold-prices', desc:'Precios del oro, demanda por sector, reservas de bancos centrales y flujos hacia ETFs.', cat:'commodities', icon:'🥇', tag:'Oro · Global' },
  { name:'EIA — Energy Information Admin.', url:'https://www.eia.gov', desc:'Inventarios semanales de petróleo y gas USA. Mueve el precio del crudo cada miércoles.', cat:'commodities', icon:'⚡', tag:'Energía · USA' },
  { name:'LME — London Metal Exchange', url:'https://www.lme.com/Metals', desc:'Precios de metales industriales: cobre, aluminio, zinc, níquel. El cobre como indicador económico global.', cat:'commodities', icon:'⚙️', tag:'Metales · Global' },
  { name:'CME Group — Commodities', url:'https://www.cmegroup.com/markets/commodities.html', desc:'Futuros de energía, metales y agrícolas. Posicionamiento COT (Commitment of Traders).', cat:'commodities', icon:'📦', tag:'CME · Global' },

  { name:'Financial Times', url:'https://www.ft.com', desc:'El periódico financiero más influyente del mundo. Mercados, política económica y análisis macro diario.', cat:'geopolitics', icon:'📰', tag:'Prensa · Global' },
  { name:'The Economist', url:'https://www.economist.com', desc:'Análisis económico y político global de referencia. Cobertura de economías emergentes y ciclos.', cat:'geopolitics', icon:'📰', tag:'Prensa · Global' },
  { name:'Council on Foreign Relations', url:'https://www.cfr.org', desc:'Análisis de política exterior y geopolítica de primer nivel. Imprescindible para entender riesgos en cartera.', cat:'geopolitics', icon:'🌐', tag:'Geopolítica · USA' },
  { name:'Stratfor — RANE', url:'https://worldview.stratfor.com', desc:'Inteligencia geopolítica profesional. Análisis de regiones, conflictos y riesgos políticos en mercados.', cat:'geopolitics', icon:'🗺', tag:'Geopolítica · Global' },
  { name:'Global Risk Map — Aon', url:'https://www.aon.com/risk-services/political-risk-map.jsp', desc:'Mapa de riesgos políticos por país. Útil para valorar exposición a mercados emergentes.', cat:'geopolitics', icon:'🗺', tag:'Riesgo · Global' },

  { name:'Damodaran Online', url:'https://pages.stern.nyu.edu/~adamodar', desc:'El profesor de valoración más influyente. Betas, primas de riesgo y márgenes por sector actualizados anualmente.', cat:'research', icon:'🎓', tag:'Valoración · Academia' },
  { name:'Howard Marks — Oaktree Memos', url:'https://www.oaktreecapital.com/insights/memo', desc:'Memos sobre ciclos de mercado, riesgo y comportamiento inversor. Lectura obligatoria.', cat:'research', icon:'📄', tag:'Research · Value' },
  { name:'GMO — Jeremy Grantham', url:'https://www.gmo.com/americas/research-library', desc:'Cartas trimestrales sobre burbujas, valoración de activos y riesgos sistémicos a largo plazo.', cat:'research', icon:'📄', tag:'Research · Value' },
  { name:'Ray Dalio — Principles', url:'https://www.principles.com', desc:'Marco para entender ciclos de deuda y máquinas económicas. Cómo posicionarse en distintos regímenes macro.', cat:'research', icon:'📄', tag:'Research · Macro' },
  { name:'Research Affiliates', url:'https://www.researchaffiliates.com', desc:'Expected returns por clase de activo, valoración global y perspectivas de largo plazo.', cat:'research', icon:'🔬', tag:'Research · Global' },
  { name:'NBER — Ciclos Económicos', url:'https://www.nber.org/research/business-cycle-dating', desc:'Define oficialmente las recesiones USA. Papers académicos sobre ciclos y política económica.', cat:'research', icon:'🎓', tag:'Academia · USA' },
];

export const MACRO_CATS = [
  { key:'all', label:'Todas' },
  { key:'central-banks', label:'Bancos Centrales' },
  { key:'data', label:'Datos Económicos' },
  { key:'markets', label:'Mercados' },
  { key:'commodities', label:'Commodities' },
  { key:'geopolitics', label:'Geopolítica' },
  { key:'research', label:'Research & Think Tanks' },
];

// ─── Opciones del Stock Screener ─────────────────────────────
export const SC_SECTORS = ['','Technology','Healthcare','Financial','Energy','Consumer Cyclical','Consumer Defensive','Industrials','Utilities','Real Estate','Basic Materials','Communication Services'];
export const SC_SECTOR_LABELS = { '':'Todos', 'Financial':'Financials' };
export const SC_CAP = [['','Todos'],['mega','Mega (+200B)'],['large','Large (10B-200B)'],['mid','Mid (2B-10B)'],['small','Small (300M-2B)'],['micro','Micro (-300M)']];
export const SC_PE = [['','Cualquiera'],['u5','Menos de 5'],['u10','Menos de 10'],['u15','Menos de 15'],['u20','Menos de 20'],['u25','Menos de 25'],['u30','Menos de 30'],['u40','Menos de 40'],['u50','Menos de 50']];
export const SC_PB = [['','Cualquiera'],['u1','Menos de 1'],['u2','Menos de 2'],['u3','Menos de 3'],['u5','Menos de 5'],['u10','Menos de 10']];
export const SC_DIV = [['','Cualquiera'],['o1','Más de 1%'],['o2','Más de 2%'],['o3','Más de 3%'],['o4','Más de 4%'],['o5','Más de 5%'],['o6','Más de 6%']];
export const SC_ROE = [['','Cualquiera'],['o10','Más de 10%'],['o15','Más de 15%'],['o20','Más de 20%'],['o25','Más de 25%'],['o30','Más de 30%']];
export const SC_COUNTRY = [['','Todos'],['USA','USA'],['Europe','Europa'],['Spain','España'],['Germany','Alemania'],['UK','Reino Unido'],['Japan','Japón'],['China','China']];
export const SC_STRAT = [['','Todas'],['value','Value'],['growth','Growth'],['dividend','Dividend'],['momentum','Momentum']];

// ─── Constructores de URL de screeners externos ─────────────
export function buildFinvizFilters(f) {
  const filters = [];
  if (f.sector)  filters.push('sec_' + f.sector.replace(/ /g, '%20'));
  if (f.cap)     { const m = { mega:'cap_mega', large:'cap_largeover', mid:'cap_mid', small:'cap_small', micro:'cap_micro' }; if (m[f.cap]) filters.push(m[f.cap]); }
  if (f.pe)      filters.push('fa_pe_' + f.pe);
  if (f.pb)      filters.push('fa_pb_' + f.pb);
  if (f.div)     filters.push('fa_div_' + f.div);
  if (f.roe)     filters.push('fa_roe_' + f.roe);
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
export const SCREENER_TOOLS = [
  { url:'https://openinsider.com', icon:'📋', name:'OpenInsider', desc:'Transacciones de insiders en tiempo real' },
  { url:'https://whalewisdom.com', icon:'🐋', name:'WhaleWisdom', desc:'Posiciones institucionales y 13F' },
  { url:'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=4&dateb=&owner=include&count=20', icon:'🏛', name:'SEC EDGAR', desc:'Form 4 oficiales — fuente primaria' },
  { url:'https://simplywall.st/stocks', icon:'🧱', name:'Simply Wall St', desc:'Análisis visual de fundamentales' },
  { url:'https://stockanalysis.com/stocks/screener/', icon:'🔎', name:'Stock Analysis', desc:'Screener gratuito con muchos filtros' },
  { url:'https://www.macrotrends.net', icon:'📉', name:'Macrotrends', desc:'Histórico de métricas a largo plazo' },
];

// ─── Navegación ──────────────────────────────────────────────
export const NAV = [
  { section:'Principal' },
  { id:'dashboard', icon:'◈', label:'Dashboard' },
  { section:'Activos' },
  { id:'assets', icon:'◆', label:'Mis Activos' },
  { id:'watchlist', icon:'★', label:'Watchlist' },
  { id:'compare', icon:'⇄', label:'Comparador' },
  { id:'charts', icon:'◎', label:'Gráficos' },
  { id:'screener', icon:'⊞', label:'Stock Screener' },
  { section:'Conocimiento' },
  { id:'learning', icon:'◉', label:'Aprendizaje' },
  { id:'trends', icon:'📡', label:'Tendencias' },
  { id:'marketmap', icon:'🗺', label:'Mapa de Mercado' },
  { id:'macro', icon:'🌐', label:'Macro Research' },
];
export const PAGE_TITLES = { dashboard:'Dashboard', assets:'Mis Activos', watchlist:'Watchlist', compare:'Comparador de Activos', charts:'Gráficos', screener:'Stock Screener', learning:'Aprendizaje', trends:'Tendencias de Mercado', marketmap:'Mapa de Mercado', macro:'Macro Research' };
