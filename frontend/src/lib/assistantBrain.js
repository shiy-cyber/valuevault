// ─────────────────────────────────────────────────────────────
// Asistente interno de ValueVault — BASADO EN REGLAS (sin IA externa,
// sin API, sin coste). Responde sobre: (1) definiciones/glosario,
// (2) cómo funciona la app, y (3) datos de TU cartera (calculados en
// el navegador a partir de los activos ya cargados).
// answer(question, ctx) → { text, chips?, action? }
//   ctx = { assets, notes, fxRates, go }
//   action = { label, section } → botón para navegar
//   chips  = [{ label, q }]     → sugerencias clicables
// ─────────────────────────────────────────────────────────────
import { changePct, positionMetrics, portfolioStats, compositeScore, fmt, fmtBase, fmtUsdCompact } from './format.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const has = (q, ...words) => words.some(w => q.includes(w));
const portfolioOf = (assets) => (assets || []).filter(a => a.type !== 'watchlist');
const watchlistOf = (assets) => (assets || []).filter(a => a.type === 'watchlist');

// ─── Glosario de conceptos ───────────────────────────────────
const GLOSSARY = {
  roic: ['ROIC', 'ROIC (Retorno sobre el Capital Invertido) = NOPAT ÷ capital invertido. Mide la rentabilidad que la empresa saca al dinero que pone a trabajar. Si el ROIC supera al WACC, la empresa CREA valor; si no, lo destruye. Por encima del 15% se considera excelente.'],
  wacc: ['WACC', 'WACC (Coste Medio Ponderado del Capital) = coste de financiarse mezclando deuda y fondos propios. Es la rentabilidad mínima que hay que superar para crear valor. En ValueVault se calcula con CAPM (coste de equity vía beta) + coste de deuda, ponderado por capitalización de mercado.'],
  dcf: ['DCF', 'DCF (Descuento de Flujos de Caja) = valora una empresa descontando sus flujos de caja libres futuros a valor presente con el WACC, más un valor terminal. Lo tienes en la sección "Valoración DCF".'],
  capex: ['CapEx', 'CapEx (Gastos de Capital) = lo que invierte la empresa en activos fijos (fábricas, data centers, equipos, tiendas…). En el panel de cada activo verás el importe, su intensidad (CapEx/Ingresos), si es de crecimiento o mantenimiento (CapEx/Amortización) y una explicación de en qué invierte.'],
  fcf: ['FCF', 'FCF (Flujo de Caja Libre) = caja operativa − CapEx. Es el dinero que sobra tras mantener e invertir en el negocio; el que se puede repartir, recomprar acciones o amortizar deuda.'],
  'fcf yield': ['FCF Yield', 'FCF Yield = FCF ÷ capitalización. Una "rentabilidad de caja". Por encima del 5% suele ser atractivo.'],
  per: ['P/E (PER)', 'P/E o PER (Precio/Beneficio) = precio entre beneficio por acción; cuántos años de beneficios pagas por la acción. Más bajo = más barato, en igualdad de condiciones.'],
  pb: ['P/B', 'P/B (Precio/Valor Contable) = precio entre valor en libros por acción. Útil sobre todo en bancos y empresas con muchos activos tangibles.'],
  peg: ['PEG', 'PEG = P/E ÷ crecimiento esperado del BPA. Ajusta el P/E por crecimiento: por debajo de 1 suele indicar oportunidad (GARP).'],
  evebitda: ['EV/EBITDA', 'EV/EBITDA = valor de empresa ÷ EBITDA. Múltiplo de valoración que ignora estructura de capital e impuestos; bueno para comparar entre empresas.'],
  ps: ['P/S', 'P/S (Precio/Ventas) = capitalización ÷ ingresos. Útil cuando aún no hay beneficios (growth).'],
  eps: ['EPS / BPA', 'EPS (BPA, Beneficio Por Acción) = beneficio neto ÷ nº de acciones. Su crecimiento y las revisiones de analistas son clave para el momentum.'],
  roe: ['ROE', 'ROE (Retorno sobre Fondos Propios) = beneficio neto ÷ patrimonio. Por encima del 15% es bueno. Ojo: puede inflarse con deuda.'],
  roa: ['ROA', 'ROA (Retorno sobre Activos) = beneficio neto ÷ activos totales. Mide eficiencia sin el efecto del apalancamiento.'],
  beta: ['Beta', 'Beta = sensibilidad del activo respecto al mercado. β>1 más volátil que el mercado; β<1 más defensivo. Se usa en el CAPM para el coste de equity.'],
  margen: ['Márgenes', 'Margen bruto (ventas − coste de ventas), operativo (tras gastos del negocio) y neto (beneficio final ÷ ingresos). Márgenes altos y estables = poder de fijación de precios.'],
  dividendo: ['Dividendo', 'Dividend Yield = dividendo anual ÷ precio. Payout = % del beneficio repartido. Un payout muy alto puede ser insostenible.'],
  moat: ['Moat', 'Moat = ventaja competitiva duradera (marcas, costes de cambio, efecto red, ventaja de costes, escala). Suele traducirse en ROIC alto y sostenido.'],
  'margen de seguridad': ['Margen de seguridad', 'Margen de seguridad (Graham) = comprar con descuento respecto al valor intrínseco para protegerte de errores. Graham recomendaba al menos un 33%.'],
  garp: ['GARP', 'GARP (Growth At a Reasonable Price) = crecimiento a precio razonable. Combina growth con valoración sensata; PEG < 1 es la señal típica.'],
  'volume profile': ['Volume Profile / VWAP', 'Volume Profile = volumen negociado por nivel de precio (POC, VAH, VAL = zonas de mayor interés). VWAP = precio medio ponderado por volumen. Sección "Vol. Profile / VWAP".'],
  'smart money': ['Smart Money', 'Smart Money Concepts: FVG (Fair Value Gaps, huecos de ineficiencia) y Order Blocks (zonas de órdenes institucionales). Es experimental, en la sección "Smart Money".'],
  gamma: ['Gamma / GEX', 'GEX (Gamma Exposure) = exposición a gamma de los market makers por strike. Marca "muros" de contención del precio. Sección "Gamma / GEX", con modo agregado de varios vencimientos.'],
  'trend following': ['Trend Following / CTA', 'Trend Following / CTA = estrategia de seguimiento de tendencia: señal por cruce de medias (MA50/200), canal Donchian, ATR para el stop y vol targeting para el tamaño. Sección "Trend Following / CTA".'],
  'fear and greed': ['Fear & Greed', 'Índice de miedo y codicia (CNN) + VIX + cripto. Miedo extremo puede ser señal contrarian de compra; codicia extrema, de cautela. Sección "Sentimiento".'],
  cape: ['CAPE / Shiller PE', 'CAPE (Shiller PE / PE10) = precio del S&P 500 ÷ beneficios medios de 10 años ajustados por inflación. Mide si el MERCADO ENTERO está caro o barato vs su historia (media ~17). Un CAPE alto se asocia a menores retornos a 10 años, pero es mal indicador de timing. Lo tienes EN VIVO en la sección "Sentimiento".'],
  shiller: ['CAPE / Shiller PE', 'El CAPE de Shiller (PE10) valora el S&P 500 con 10 años de beneficios ajustados por inflación. Media histórica ~17; alto = mercado caro. En vivo en la sección "Sentimiento".'],
  score: ['Score compuesto', 'Score compuesto (0-100) en 3 pilares: Valor, Calidad y Momentum. Convierte ~24 ratios en 3 decisiones. El de Momentum es un proxy si no hay revisiones de analistas.'],
};
function glossaryHit(q) {
  // Coincidencia por término (el más largo primero para no cortar)
  const keys = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (q.includes(norm(k)) || q.includes(norm(GLOSSARY[k][0]))) {
      const [title, body] = GLOSSARY[k];
      return { text: `📘 ${title}\n\n${body}` };
    }
  }
  return null;
}

// ─── Ayuda de la app (cómo funciona) ─────────────────────────
const HELP = [
  { kw: ['anadir activo', 'agregar activo', 'nuevo activo', 'como meto', 'como añado', 'crear activo'], text: 'Pulsa «+ Nuevo Activo» (arriba a la derecha) o el botón de añadir. Rellena ticker, nombre, precio de entrada, tamaño y, opcionalmente, tesis/objetivo/stop. También puedes usar el autocompletado por ticker (Alpha Vantage).', action: { label: 'Ir a Mis Activos', section: 'assets' } },
  { kw: ['watchlist', 'seguimiento'], text: 'La Watchlist es para activos que sigues pero NO tienes en cartera (marcados con ★). Es independiente de tu cartera real.', action: { label: 'Ir a Watchlist', section: 'watchlist' } },
  { kw: ['comparador', 'comparar'], text: 'El Comparador enfrenta 2-3 activos métrica a métrica; resalta en verde el mejor y en rojo el peor de cada fila.', action: { label: 'Ir al Comparador', section: 'compare' } },
  { kw: ['screener', 'filtrar acciones', 'buscar acciones'], text: 'El Stock Screener arma filtros (sector, capitalización, P/E, P/B, dividendo, ROE…) y te abre Finviz/StockAnalysis con esos filtros ya aplicados.', action: { label: 'Ir al Screener', section: 'screener' } },
  { kw: ['fundamentales', 'roic', 'calcular calidad'], text: 'Abre un activo (clic en la fila) y pulsa «📊 Fundamentales» para traer ROIC, FCF Yield, WACC, CapEx y consenso de analistas (Alpha Vantage, 25 req/día).', action: { label: 'Ir a Mis Activos', section: 'assets' } },
  { kw: ['valoracion', 'dcf', 'valor intrinseco', 'cuanto vale'], text: 'La sección «Valoración DCF» estima el valor intrínseco con descuento de flujos + ROIC/WACC. Autocompleta datos por ticker y aplica el WACC por estructura de capital.', action: { label: 'Ir a Valoración DCF', section: 'valuation' } },
  { kw: ['historico', 'grafico de precio', 'evolucion'], text: 'Abre un activo (clic en la fila) y verás el gráfico histórico de precio con rangos 1M/6M/1A/5A.', action: { label: 'Ir a Mis Activos', section: 'assets' } },
  { kw: ['exportar', 'export', 'backup', 'copia'], text: 'En la barra lateral (abajo) tienes «💾 Export» para descargar tu cartera y notas en JSON.' },
  { kw: ['cuenta', 'registrar', 'iniciar sesion', 'login', 'crear cuenta'], text: 'Pulsa «🔑 Iniciar sesión / Registrarse». Con cuenta, tu cartera y notas son privadas. Sin sesión ves la cartera DEMO (solo lectura).' },
  { kw: ['recuperacion', 'recuperar cuenta', 'olvide', 'contrasena'], text: 'La recuperación es por CÓDIGO (la app no envía correos). Guarda tu código «XXXX-XXXX-XXXX-XXXX»; para resetear necesitas email + código + nueva contraseña.' },
  { kw: ['notas', 'aprendizaje'], text: 'La sección «Aprendizaje» guarda notas de inversión, que puedes vincular a un activo concreto.', action: { label: 'Ir a Aprendizaje', section: 'learning' } },
  { kw: ['macro', 'tipos', 'inflacion', 'fed'], text: 'La sección «Macro Research» trae 37 indicadores en vivo (curva de tipos, inflación, empleo, Fed…) más fuentes de referencia.', action: { label: 'Ir a Macro', section: 'macro' } },
  { kw: ['mapa de mercado', 'treemap', 'finviz'], text: 'El «Mapa de Mercado» es un treemap tipo Finviz con grandes valores coloreados por variación diaria. Doble clic en un valor abre su ficha en Finviz.', action: { label: 'Ir al Mapa', section: 'marketmap' } },
  { kw: ['manual', 'ayuda', 'como funciona', 'guia', 'instrucciones'], text: 'Tienes el «Manual de uso» en la sección «Aprendizaje y Manual» (pestaña Manual de uso). Y a mí puedes preguntarme definiciones, cómo usar cada sección y datos de tu cartera.', action: { label: 'Ir al Manual', section: 'learning' } },
];
function helpHit(q) {
  for (const h of HELP) if (has(q, ...h.kw.map(norm))) return { text: '🧭 ' + h.text, action: h.action };
  return null;
}

// ─── Métricas para superlativos ("mayor/menor/mejor/peor X") ──
const METRICS = [
  { field: 'pe', label: 'P/E', aliases: ['pe', 'p/e', 'per'], better: 'low', suf: 'x', valuation: true },
  { field: 'fpe', label: 'Forward P/E', aliases: ['forward pe', 'fwd pe', 'pe adelantado'], better: 'low', suf: 'x', valuation: true },
  { field: 'pb', label: 'P/B', aliases: ['pb', 'p/b'], better: 'low', suf: 'x', valuation: true },
  { field: 'ps', label: 'P/S', aliases: ['ps', 'p/s'], better: 'low', suf: 'x', valuation: true },
  { field: 'peg', label: 'PEG', aliases: ['peg'], better: 'low', valuation: true },
  { field: 'evebitda', label: 'EV/EBITDA', aliases: ['ev/ebitda', 'ev ebitda'], better: 'low', suf: 'x', valuation: true },
  { field: 'roe', label: 'ROE', aliases: ['roe'], better: 'high', suf: '%' },
  { field: 'roa', label: 'ROA', aliases: ['roa'], better: 'high', suf: '%' },
  { field: 'roic', label: 'ROIC', aliases: ['roic'], better: 'high', suf: '%' },
  { field: 'fcfy', label: 'FCF Yield', aliases: ['fcf yield', 'fcfy'], better: 'high', suf: '%' },
  { field: 'dy', label: 'Dividend Yield', aliases: ['dividendo', 'dividend', 'yield', 'rentabilidad por dividendo'], better: 'high', suf: '%' },
  { field: 'beta', label: 'Beta', aliases: ['beta'], better: 'low' },
  { field: 'gm', label: 'Margen Bruto', aliases: ['margen bruto', 'gross margin'], better: 'high', suf: '%' },
  { field: 'om', label: 'Margen Operativo', aliases: ['margen operativo', 'operating margin'], better: 'high', suf: '%' },
  { field: 'nm', label: 'Margen Neto', aliases: ['margen neto', 'net margin'], better: 'high', suf: '%' },
  { field: 'capex', label: 'CapEx', aliases: ['capex', 'gastos de capital'], better: 'high', usd: true },
];
function findMetric(q) {
  // alias más largo primero
  const all = METRICS.flatMap(m => m.aliases.map(a => ({ a: norm(a), m }))).sort((x, y) => y.a.length - x.a.length);
  for (const { a, m } of all) if (new RegExp(`(^|[^a-z])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(q)) return m;
  return null;
}
function dirOf(q, metric) {
  if (has(q, 'mas caro', 'mas cara', 'mas caras', 'mas caros')) return 'max';
  if (has(q, 'mas barato', 'mas barata', 'mas baratas', 'mas baratos')) return 'min';
  if (has(q, 'mayor', 'mas alto', 'mas alta', 'maximo', 'mas grande', 'top', 'el que mas', 'la que mas')) return 'max';
  if (has(q, 'menor', 'mas bajo', 'mas baja', 'minimo', 'mas pequeno', 'el que menos', 'la que menos')) return 'min';
  if (has(q, 'mejor')) return metric.better === 'low' ? 'min' : 'max';
  if (has(q, 'peor')) return metric.better === 'low' ? 'max' : 'min';
  return null;
}
function extremum(list, field, dir) {
  const valid = list.filter(a => a[field] != null && a[field] !== '' && !isNaN(a[field]));
  if (!valid.length) return null;
  return valid.reduce((best, a) => ((dir === 'max' ? +a[field] > +best[field] : +a[field] < +best[field]) ? a : best));
}

// Resumen de un activo concreto
function assetCard(a) {
  const chg = changePct(a);
  const sc = compositeScore(a);
  const lines = [
    `📈 ${a.ticker} — ${a.name || ''}${a.sector ? ' · ' + a.sector : ''}`,
    `Precio: $${fmt(a.current)} (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% vs entrada)`,
    `P/E ${fmt(a.pe)} · ROE ${fmt(a.roe)}% · ROIC ${a.roic != null ? a.roic + '%' : '—'} · Div ${a.dy != null ? a.dy + '%' : '—'}`,
    `Score compuesto: ${sc.total ?? '—'}/100 (Valor ${sc.value ?? '—'} · Calidad ${sc.quality ?? '—'} · Momentum ${sc.momentum ?? '—'})`,
  ];
  if (a.thesis) lines.push(`Tesis: ${a.thesis.slice(0, 180)}${a.thesis.length > 180 ? '…' : ''}`);
  return lines.join('\n');
}
function findAssetByText(q, assets) {
  const up = q.toUpperCase();
  // por ticker exacto en los tokens
  for (const a of assets) {
    const t = (a.ticker || '').toUpperCase();
    if (t && new RegExp(`(^|[^A-Z0-9.])${t.replace('.', '\\.')}([^A-Z0-9.]|$)`).test(up)) return a;
  }
  // por nombre (palabra significativa)
  for (const a of assets) {
    const n = norm(a.name || '');
    if (n && n.split(' ').some(w => w.length > 3 && q.includes(w))) return a;
  }
  return null;
}

// ─── Router principal ────────────────────────────────────────
export function answer(question, ctx = {}) {
  const q = norm(question);
  const assets = ctx.assets || [];
  const port = portfolioOf(assets);
  const fx = ctx.fxRates || { EUR: 1 };
  if (!q) return { text: 'Pregúntame algo 🙂' };

  // Capacidades / ayuda general
  if (has(q, 'que puedes hacer', 'que sabes', 'ayuda', 'que eres', 'para que sirves', 'opciones')) {
    return {
      text: '🤖 Soy el asistente de ValueVault. Puedo ayudarte con:\n\n• Definiciones: «¿qué es el ROIC?», «explícame el DCF», «qué es CapEx».\n• Cómo usar la app: «cómo añado un activo», «para qué sirve el screener».\n• Tu cartera: «mi mejor activo», «cuáles están en pérdidas», «valor de mi cartera», «el de mayor ROE», «háblame de AAPL».\n\nSoy local (sin coste, sin enviar nada fuera).',
      chips: [
        { label: '¿Qué es el ROIC?', q: '¿qué es el ROIC?' },
        { label: 'Mi mejor activo', q: 'mi mejor activo' },
        { label: 'Valor de mi cartera', q: 'valor de mi cartera' },
        { label: '¿Cómo añado un activo?', q: '¿cómo añado un activo?' },
      ],
    };
  }

  // Preguntas de tipo definición/ayuda → glosario/ayuda ANTES que los datos
  // (evita que "qué es la watchlist" devuelva el contenido en vez de explicarla)
  if (has(q, 'que es', 'que son', 'que significa', 'que quiere decir', 'para que sirve', 'para que vale', 'explica', 'explicame', 'define', 'definicion de', 'que diferencia')) {
    const g0 = glossaryHit(q); if (g0) return g0;
    const h0 = helpHit(q); if (h0) return h0;
  }

  // ── Datos de la cartera ──
  const portIntent = has(q, 'mi ', 'mis ', 'cartera', 'tengo', 'tenemos', 'mi cartera', 'portfolio');

  // Valor total de la cartera
  if (has(q, 'valor', 'cuanto vale mi', 'cuanto tengo', 'total de mi') && (portIntent || has(q, 'cartera'))) {
    const st = portfolioStats(port, fx);
    if (st.valueBase == null) return { text: '💼 No puedo calcular el valor: necesito tamaño de posición (nº de acciones) y precio en tus activos. Edita un activo y añade el tamaño.' };
    const pnl = st.pnlBase, ret = st.returnPct;
    return { text: `💼 Valor de tu cartera: ${fmtBase(st.valueBase)}\nP&L: ${fmtBase(pnl)} (${ret != null ? (ret >= 0 ? '+' : '') + ret.toFixed(1) + '%' : '—'})\nPosiciones valoradas: ${st.sized}${st.unsized ? ` (${st.unsized} sin tamaño)` : ''}` };
  }

  // Rendimiento / P&L
  if (has(q, 'rendimiento', 'p&l', 'pnl', 'como va mi', 'como voy', 'ganando', 'perdiendo') && portIntent) {
    const st = portfolioStats(port, fx);
    if (st.returnPct == null) return { text: '📊 Aún no puedo medir el rendimiento (faltan tamaños/precio). Añade el tamaño de posición a tus activos.' };
    return { text: `📊 Rendimiento de la cartera: ${st.returnPct >= 0 ? '+' : ''}${st.returnPct.toFixed(1)}% · P&L ${fmtBase(st.pnlBase)} sobre ${fmtBase(st.costBase)} invertidos.` };
  }

  // En pérdidas / en ganancias
  if (has(q, 'perdidas', 'en rojo', 'perdiendo', 'bajando')) {
    const losers = port.filter(a => changePct(a) < 0).sort((x, y) => changePct(x) - changePct(y));
    if (!losers.length) return { text: '✅ Ninguno de tus activos está en pérdidas ahora mismo.' };
    return { text: '🔻 Activos en pérdidas:\n' + losers.map(a => `• ${a.ticker}: ${changePct(a).toFixed(2)}%`).join('\n') };
  }
  if (has(q, 'ganancias', 'en verde', 'ganando', 'subiendo', 'plusvalia')) {
    const win = port.filter(a => changePct(a) > 0).sort((x, y) => changePct(y) - changePct(x));
    if (!win.length) return { text: 'Ninguno de tus activos está en positivo ahora mismo.' };
    return { text: '🟢 Activos en ganancias:\n' + win.map(a => `• ${a.ticker}: +${changePct(a).toFixed(2)}%`).join('\n') };
  }

  // Listado / conteo
  if (has(q, 'que activos', 'cuales activos', 'lista', 'que tengo', 'mis activos') && !findMetric(q)) {
    if (!port.length) return { text: 'Tu cartera está vacía. Añade un activo con «+ Nuevo Activo».', action: { label: 'Ir a Mis Activos', section: 'assets' } };
    return { text: `💼 Tienes ${port.length} activos:\n` + port.map(a => `• ${a.ticker} — ${a.name || ''}`).join('\n') };
  }
  if (has(q, 'cuantos activos', 'numero de activos')) {
    return { text: `Tienes ${port.length} activos en cartera y ${watchlistOf(assets).length} en seguimiento (watchlist).` };
  }
  if (has(q, 'watchlist', 'seguimiento') && has(q, 'que', 'cuales', 'lista', 'tengo')) {
    const wl = watchlistOf(assets);
    if (!wl.length) return { text: 'Tu watchlist está vacía.' };
    return { text: '★ En seguimiento:\n' + wl.map(a => `• ${a.ticker} — ${a.name || ''}`).join('\n') };
  }
  if (has(q, 'cuantas notas', 'numero de notas')) {
    return { text: `Tienes ${(ctx.notes || []).length} notas de aprendizaje.` };
  }

  // Mejor / peor por puntuación
  if (has(q, 'mejor', 'peor', 'mayor', 'menor') && has(q, 'score', 'puntuacion', 'puntaje')) {
    const dir = has(q, 'peor', 'menor', 'mas bajo') ? 'min' : 'max';
    const scored = port.map(a => ({ a, s: compositeScore(a).total })).filter(x => x.s != null);
    if (!scored.length) return { text: 'No tengo scores calculados. Pulsa «📊 Fundamentales» en tus activos.' };
    const pick = scored.reduce((b, x) => ((dir === 'max' ? x.s > b.s : x.s < b.s) ? x : b));
    return { text: `🏅 El de ${dir === 'max' ? 'mejor' : 'peor'} score es ${pick.a.ticker} con ${pick.s}/100.` };
  }

  // Superlativo por métrica (mayor ROE, más barato por P/E, mejor dividendo…)
  const metric = findMetric(q);
  if (metric && has(q, 'mayor', 'menor', 'mejor', 'peor', 'mas alto', 'mas bajo', 'mas caro', 'mas barato', 'top', 'el que mas', 'el que menos', 'maximo', 'minimo')) {
    const dir = dirOf(q, metric) || (metric.better === 'low' ? 'min' : 'max');
    const pick = extremum(port, metric.field, dir);
    if (!pick) return { text: `No tengo el dato de ${metric.label} en tus activos. Pulsa «📊 Fundamentales» o «🔄 Actualizar datos».` };
    const val = metric.usd ? fmtUsdCompact(pick[metric.field]) : fmt(pick[metric.field]) + (metric.suf || '');
    return { text: `📌 ${pick.ticker} es el de ${dir === 'max' ? 'mayor' : 'menor'} ${metric.label}: ${val}.` };
  }

  // Mejor / peor activo (por variación) sin métrica
  if (has(q, 'mejor activo', 'peor activo', 'el que mas sube', 'el que mas baja', 'mas sube', 'mas baja', 'mas rentable')) {
    if (!port.length) return { text: 'Tu cartera está vacía.' };
    const dir = has(q, 'peor', 'mas baja', 'mas cae', 'que mas baja') ? 'min' : 'max';
    const pick = port.slice().sort((x, y) => changePct(y) - changePct(x))[dir === 'max' ? 0 : port.length - 1];
    return { text: `${dir === 'max' ? '🚀' : '🔻'} Tu ${dir === 'max' ? 'mejor' : 'peor'} activo (por variación) es ${pick.ticker}: ${changePct(pick) >= 0 ? '+' : ''}${changePct(pick).toFixed(2)}%.` };
  }

  // Ficha de un activo concreto ("háblame de AAPL", "info MSFT")
  const named = findAssetByText(question, assets);
  if (named && (has(q, 'info', 'habla', 'dime', 'que tal', 'como va', 'resumen', 'detalle', 'sobre') || norm(question).split(' ').length <= 3)) {
    return { text: assetCard(named) };
  }

  // ── Glosario y ayuda ──
  const g = glossaryHit(q);
  if (g) return g;
  const h = helpHit(q);
  if (h) return h;

  // Fallback
  return {
    text: 'No estoy seguro de eso 🤔. Soy un asistente de reglas (sin IA externa). Puedo con: definiciones (ROIC, WACC, DCF, CapEx…), cómo usar la app, y datos de tu cartera (mejor/peor activo, en pérdidas, valor total, mayor ROE, ficha de un ticker…).',
    chips: [
      { label: '¿Qué es el WACC?', q: '¿qué es el WACC?' },
      { label: 'Activos en pérdidas', q: 'qué activos tengo en pérdidas' },
      { label: 'Mayor ROE', q: 'el de mayor ROE' },
      { label: '¿Cómo uso el screener?', q: '¿cómo uso el screener?' },
    ],
  };
}

export const WELCOME = {
  text: '👋 Hola, soy el asistente de ValueVault (local, sin coste). Pregúntame definiciones, cómo usar la app o datos de tu cartera.',
  chips: [
    { label: '¿Qué es el ROIC?', q: '¿qué es el ROIC?' },
    { label: 'Mi mejor activo', q: 'mi mejor activo' },
    { label: 'Valor de mi cartera', q: 'valor de mi cartera' },
    { label: '¿Qué puedes hacer?', q: '¿qué puedes hacer?' },
  ],
};
