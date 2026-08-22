// ─────────────────────────────────────────────────────────────
// Autocompletado de fundamentales para la calculadora DCF / ROIC.
// Precio en vivo vía Yahoo (gratis). Fundamentales vía Alpha Vantage
// (OVERVIEW + CASH_FLOW + INCOME_STATEMENT + BALANCE_SHEET): 4 llamadas,
// secuenciales con pausa (clave gratuita ≤1 req/s, 25/día). Cache 24h
// por ticker. Si AV agota cuota, se devuelve {limited:true} y la
// calculadora sigue funcionando en modo manual.
// ─────────────────────────────────────────────────────────────
import { getQuote, getHistory } from './sectors.js';
import { avQuery } from './avCache.js';
import { fmpQuery } from './fmp.js';

const num = (v) => {
  if (v === undefined || v === null || v === 'None' || v === '' || v === '-') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

// Crecimiento del FCF ROBUSTO: regresión log-lineal sobre la serie (usa TODOS
// los años, no solo 2 extremos → inmune a un año atípico). Banda = rango de los
// crecimientos año a año. Degrada a CAGR de 2 puntos si solo hay 2 años útiles.
// history: [{year:'YYYY', fcf}] (más reciente primero). FCF>0 para poder usar ln.
function robustGrowth(history) {
  const pts = (history || [])
    .map(h => ({ x: Number(h.year), y: h.fcf }))
    .filter(p => Number.isFinite(p.x) && p.y > 0)
    .sort((a, b) => a.x - b.x); // cronológico
  const n = pts.length;
  if (n < 2) return { growth: null, low: null, high: null, method: 'insuficiente', nYears: n };

  // Regresión OLS de ln(y) sobre x → pendiente b ; crecimiento anual = e^b − 1
  const xs = pts.map(p => p.x), ys = pts.map(p => Math.log(p.y));
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const g = Math.exp(sxx ? sxy / sxx : 0) - 1;

  // Banda observada: rango de crecimientos año a año
  const yoy = [];
  for (let i = 1; i < n; i++) yoy.push(pts[i].y / pts[i - 1].y - 1);
  const pct = (v) => +(v * 100).toFixed(1);
  const lo = yoy.length ? Math.min(...yoy) : g, hi = yoy.length ? Math.max(...yoy) : g;
  return { growth: pct(g), low: pct(Math.min(lo, g)), high: pct(Math.max(hi, g)), method: n >= 3 ? `regresión ${n}a` : 'cagr 2 puntos', nYears: n };
}

// Clasifica el perfil de inversión en español a partir de la intensidad
// (CapEx/Ingresos) y del proxy crecimiento vs mantenimiento (CapEx/Amortización).
//   CapEx/Ingresos: ≥15% intensiva · 6–15% moderada · <6% ligera en activos
//   CapEx/Amortización: ≥1.2x expansión · 0.8–1.2x mantenimiento · <0.8x cosecha
function capexProfileOf(capexToRevenue, capexToDA) {
  if (capexToRevenue == null && capexToDA == null) return null;
  let intensity = null;
  if (capexToRevenue != null) {
    intensity = capexToRevenue >= 15 ? 'Intensiva en capital'
      : capexToRevenue >= 6 ? 'Capital moderado'
      : 'Ligera en activos';
  }
  let phase = null;
  if (capexToDA != null) {
    phase = capexToDA >= 1.2 ? 'fase de expansión'
      : capexToDA >= 0.8 ? 'mantenimiento'
      : 'desinversión / cosecha';
  }
  return [intensity, phase].filter(Boolean).join(' · ') || null;
}

const cache = new Map(); // ticker → { ts, data }
const TTL = 24 * 60 * 60 * 1000;

// Respaldo Financial Modeling Prep para los 4 estados financieros (OVERVIEW +
// CASH_FLOW + INCOME_STATEMENT + BALANCE_SHEET), SOLO cuando Alpha Vantage
// falla (cuota/red) o no cubre el ticker. Normaliza la respuesta de FMP a la
// MISMA forma que usa el resto de este archivo (annualReports con los
// nombres de campo de Alpha Vantage) — así el cálculo de ROIC/WACC/CapEx/
// valuationHistory que sigue no necesita saber de qué proveedor vino el
// dato, y nunca se mezclan campos de los dos proveedores para un mismo
// ticker (evitaría inconsistencias: normalizaciones contables distintas).
// Comprobado en vivo: FMP cubre en su plan gratis income-statement,
// balance-sheet-statement, cash-flow-statement y profile para AAPL (que AV
// SÍ cubre en estos 4 endpoints — el hueco real de AV está en otros
// endpoints, como EARNINGS_ESTIMATES); este respaldo cubre el caso general
// de cuota agotada o un ticker sin cobertura en estos 4 concretos.
async function fetchFMPStatements(sym) {
  // OJO: el plan gratis de FMP limita income/balance/cash-flow-statement a
  // 5 registros (comprobado en vivo — distinto del límite de 10 que sí
  // admite analyst-estimates). Pedir más da un error "Premium Query
  // Parameter" y fmpQuery lo trataría como "sin dato".
  const [incRows, balRows, cfRows, profileRows] = await Promise.all([
    fmpQuery('income-statement', { symbol: sym, period: 'annual', limit: 5 }),
    fmpQuery('balance-sheet-statement', { symbol: sym, period: 'annual', limit: 5 }),
    fmpQuery('cash-flow-statement', { symbol: sym, period: 'annual', limit: 5 }),
    fmpQuery('profile', { symbol: sym }),
  ]);
  if (!incRows?.length || !balRows?.length || !cfRows?.length) return null; // FMP tampoco cubre este ticker

  // Nº de acciones: FMP lo da en income-statement (weightedAverageShsOut), no
  // en el balance como AV — se cruza por año fiscal para rellenar el balance.
  const sharesByYear = {};
  incRows.forEach(r => { if (r.date) sharesByYear[r.date.slice(0, 4)] = r.weightedAverageShsOut ?? null; });

  const income = { annualReports: incRows.map(r => ({
    fiscalDateEnding: r.date,
    totalRevenue: r.revenue,
    grossProfit: r.grossProfit,
    ebit: r.ebit,
    ebitda: r.ebitda,
    operatingIncome: r.operatingIncome,
    incomeBeforeTax: r.incomeBeforeTax,
    incomeTaxExpense: r.incomeTaxExpense,
    netIncome: r.netIncome,
    // Beneish SGAI: gastos de venta/administración sobre ventas. Nombre alineado
    // con el campo NATIVO de Alpha Vantage INCOME_STATEMENT (que es
    // "sellingGeneralAndAdministrative", SIN "Expenses" — ese sufijo es el
    // nombre de FMP, no el de AV; usarlo tal cual dejaba este campo siempre
    // null por la ruta AV primaria).
    sellingGeneralAndAdministrative: r.sellingGeneralAndAdministrativeExpenses,
  })) };
  const balance = { annualReports: balRows.map(r => ({
    fiscalDateEnding: r.date,
    totalShareholderEquity: r.totalStockholdersEquity,
    commonStockSharesOutstanding: sharesByYear[r.date?.slice(0, 4)] ?? null,
    shortTermDebt: r.shortTermDebt,
    longTermDebt: r.longTermDebt,
    shortLongTermDebtTotal: r.totalDebt,
    cashAndShortTermInvestments: r.cashAndShortTermInvestments,
    // Altman Z / Piotroski F / Beneish M: activo y pasivo total, reservas,
    // corriente y PP&E — ninguno se usaba hasta ahora, todos estándar en FMP.
    totalAssets: r.totalAssets,
    totalLiabilities: r.totalLiabilities,
    retainedEarnings: r.retainedEarnings,
    totalCurrentAssets: r.totalCurrentAssets,
    totalCurrentLiabilities: r.totalCurrentLiabilities,
    // Nombres alineados con los campos NATIVOS de Alpha Vantage BALANCE_SHEET
    // (no "netReceivables"/"propertyPlantEquipmentNet" — así funcionan igual
    // por la ruta AV primaria, no solo en el respaldo FMP).
    currentNetReceivables: r.netReceivables,
    propertyPlantEquipment: r.propertyPlantEquipmentNet,
  })) };
  // FMP da capex/recompras/dividendos en NEGATIVO (salida de caja); AV los da
  // en positivo — se homogeniza con Math.abs para que el resto del cálculo
  // (pensado para el signo de AV) no cambie.
  const cash = { annualReports: cfRows.map(r => ({
    fiscalDateEnding: r.date,
    operatingCashflow: r.operatingCashFlow,
    capitalExpenditures: r.capitalExpenditure != null ? Math.abs(r.capitalExpenditure) : null,
    depreciationDepletionAndAmortization: r.depreciationAndAmortization,
    paymentsForRepurchaseOfCommonStock: r.commonStockRepurchased != null ? Math.abs(r.commonStockRepurchased) : null,
    dividendPayout: r.netDividendsPaid != null ? Math.abs(r.netDividendsPaid) : null,
    // SBC: FMP sí la da como línea propia del cash-flow (AV no la separa)
    stockBasedCompensation: r.stockBasedCompensation,
    // Emisión de acciones (entrada de caja) — para netear contra recompras.
    // Mismo nombre de campo que usa AV nativamente en su CASH_FLOW.
    proceedsFromIssuanceOfCommonStock: r.commonStockIssuance != null ? Math.abs(r.commonStockIssuance) : null,
  })) };
  const profile = profileRows?.[0] || {};
  // Overview reducido: solo lo que FMP realmente tiene gratis (nombre, sector,
  // beta, nº de acciones). Rating de analistas/medias móviles/dividend yield
  // quedan null — no están cubiertos por los endpoints gratis de FMP; el resto
  // de la app ya tiene respaldo propio para consenso de analistas (Yahoo,
  // estimates.js), así que no es una pérdida crítica.
  const overview = {
    Symbol: sym,
    Name: profile.companyName || sym,
    Sector: profile.sector || null,
    Beta: profile.beta ?? null,
    SharesOutstanding: sharesByYear[incRows[0]?.date?.slice(0, 4)] ?? null,
    DividendYield: null,
    '50DayMovingAverage': null,
    '200DayMovingAverage': null,
    AnalystRatingStrongBuy: 0, AnalystRatingBuy: 0, AnalystRatingHold: 0, AnalystRatingSell: 0, AnalystRatingStrongSell: 0,
    AnalystTargetPrice: null,
    ReturnOnEquityTTM: null,
  };
  return { overview, income, balance, cash };
}

export async function getFundamentals(ticker) {
  const sym = String(ticker || '').trim().toUpperCase();
  if (!sym) throw Object.assign(new Error('Ticker vacío'), { status: 400 });
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  // Precio en vivo (Yahoo, no gasta cuota de Alpha Vantage)
  let price = null;
  try { const q = await getQuote(sym); price = q.price; } catch { /* sin precio */ }

  // Estados financieros: Alpha Vantage primero (caché avCache, TTL por tipo,
  // resiliencia); si CUALQUIERA de las 4 llamadas falla (cuota/red) o AV no
  // cubre el ticker (OVERVIEW vacío, sin campo Symbol — comprobado que pasa
  // con algunos valores grandes), se cae a FMP para las 4 a la vez, nunca
  // mezclando un proveedor a medias.
  let overview, cash, income, balance, fetchedAt, source = 'av';
  try {
    const ovR = await avQuery('OVERVIEW', sym);
    if (!ovR.data?.Symbol) throw Object.assign(new Error('AV sin cobertura'), { status: 502 });
    const cashR = await avQuery('CASH_FLOW', sym);
    const incR = await avQuery('INCOME_STATEMENT', sym);
    const balR = await avQuery('BALANCE_SHEET', sym);
    overview = ovR.data; cash = cashR.data; income = incR.data; balance = balR.data;
    // Antigüedad = la del dato MÁS VIEJO de los cuatro (el más conservador).
    fetchedAt = [ovR, cashR, incR, balR].map(r => r.fetchedAt).filter(Boolean).sort()[0] || null;
  } catch {
    const fmp = await fetchFMPStatements(sym);
    if (!fmp) throw Object.assign(new Error('Sin fundamentales disponibles (Alpha Vantage y FMP agotados o sin cobertura)'), { status: 502 });
    ({ overview, cash, income, balance } = fmp);
    fetchedAt = new Date().toISOString();
    source = 'fmp';
  }

  const cf = cash.annualReports?.[0] || {};
  const inc = income.annualReports?.[0] || {};
  const bal = balance.annualReports?.[0] || {};
  // Ejercicio anterior (t-1) — solo para Piotroski F y Beneish M, que comparan
  // dos años; el resto del archivo sigue usando cf/inc/bal (año más reciente).
  const cf1 = cash.annualReports?.[1] || {};
  const inc1 = income.annualReports?.[1] || {};
  const bal1 = balance.annualReports?.[1] || {};

  // Free Cash Flow = flujo de caja operativo − capex
  const fcfOf = (r) => (num(r.operatingCashflow) != null && num(r.capitalExpenditures) != null)
    ? num(r.operatingCashflow) - num(r.capitalExpenditures) : null;
  const fcf = fcfOf(cf);
  const fcfHistory = (cash.annualReports || []).slice(0, 5)
    .map(r => ({ year: r.fiscalDateEnding?.slice(0, 4), fcf: fcfOf(r) }))
    .filter(r => r.fcf != null);

  // ─── CapEx (gastos de capital) ───────────────────────────────
  // Ya viene en CASH_FLOW/INCOME_STATEMENT → sin coste de API adicional.
  // Alpha Vantage da capitalExpenditures en POSITIVO (salida de caja).
  const capex = num(cf.capitalExpenditures);
  const ocf = num(cf.operatingCashflow);
  const da = num(cf.depreciationDepletionAndAmortization);
  const revenue = num(inc.totalRevenue);
  const capexToRevenue = (capex != null && revenue) ? +((capex / revenue) * 100).toFixed(2) : null;
  const capexToOCF = (capex != null && ocf) ? +((capex / ocf) * 100).toFixed(2) : null;
  const capexToDA = (capex != null && da) ? +(capex / da).toFixed(2) : null;
  // Histórico 5 años: importe + intensidad sobre ingresos (revenue por año)
  const revByYear = {};
  (income.annualReports || []).forEach(r => {
    const y = r.fiscalDateEnding?.slice(0, 4);
    if (y) revByYear[y] = num(r.totalRevenue);
  });
  const capexHistory = (cash.annualReports || []).slice(0, 5)
    .map(r => {
      const year = r.fiscalDateEnding?.slice(0, 4);
      const cx = num(r.capitalExpenditures);
      const rev = revByYear[year];
      return { year, capex: cx, capexToRevenue: (cx != null && rev) ? +((cx / rev) * 100).toFixed(2) : null };
    })
    .filter(r => r.capex != null);
  const capexProfile = capexProfileOf(capexToRevenue, capexToDA);

  // ─── SBC (stock-based compensation) y FCF ajustado ───────────
  // Alpha Vantage sí trae esta línea nativa en CASH_FLOW; el mapeo de FMP
  // (más arriba) la replica para que la ruta de respaldo se comporte igual.
  // Cuando ninguna fuente la cubre para un ticker concreto queda en null y
  // degrada con gracia, como el resto de campos de cobertura parcial de este
  // archivo. Tratamos el SBC como gasto real en efectivo (no se "añade de
  // vuelta"): el FCF ajustado resta la dilución que ya se paga a empleados
  // en acciones.
  const sbc = num(cf.stockBasedCompensation);
  const fcfAdjusted = (fcf != null && sbc != null) ? +(fcf - sbc).toFixed(0) : null;

  // ─── CapEx de mantenimiento vs crecimiento (heurística Greenwald) ─────
  // Sin API que dé el desglose real: maintenance ≈ D&A (lo mínimo para
  // reponer el activo que se deprecia), growth = resto. Si CapEx < D&A
  // (empresa desinvirtiendo), todo el CapEx se considera mantenimiento.
  const maintenanceCapex = (capex != null && da != null) ? +Math.min(capex, da).toFixed(0) : null;
  const growthCapex = (capex != null && da != null) ? +Math.max(capex - da, 0).toFixed(0) : null;

  // CAGR de 2 extremos (legacy, se conserva para transparencia/comparación)
  let fcfCAGR = null;
  if (fcfHistory.length >= 2) {
    const newest = fcfHistory[0].fcf, oldest = fcfHistory[fcfHistory.length - 1].fcf, yrs = fcfHistory.length - 1;
    if (newest > 0 && oldest > 0) fcfCAGR = +(((Math.pow(newest / oldest, 1 / yrs)) - 1) * 100).toFixed(1);
  }
  // Crecimiento ROBUSTO (regresión log-lineal) → el que autocompleta el modelo
  const rg = robustGrowth(fcfHistory);

  // ─── Evolución histórica de valoración (P/E, P/B, EV/EBITDA, ROE, márgenes, D/E) ──
  // Reutiliza los mismos annualReports (sin coste de API AV adicional). Combina
  // cada ejercicio con el precio real de Yahoo en esa fecha (histórico gratis,
  // sin cuota) para múltiplos DE VERDAD por año, no solo el TTM actual.
  // Forward P/E histórico REAL (no trailing): Alpha Vantage EARNINGS_ESTIMATES
  // da el consenso de EPS por trimestre desde ~2017 (incluye 90 días de
  // revisiones). Sumando los 4 trimestres siguientes a cada cierre de ejercicio
  // se reconstruye el EPS estimado a 12 meses vista de ESE momento → Forward
  // P/E real por año, no una aproximación. Llamada aparte y opcional: si falla
  // (cuota AV, ticker sin cobertura de analistas) no rompe el resto.
  let quarterlyEstimates = [];
  try {
    const eeR = await avQuery('EARNINGS_ESTIMATES', sym);
    quarterlyEstimates = (eeR.data?.estimates || [])
      .filter(e => e.horizon === 'fiscal quarter' && e.date && num(e.eps_estimate_average) != null)
      .map(e => ({ date: e.date, eps: num(e.eps_estimate_average) }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch { /* sin cobertura de analistas o cuota agotada → se intenta el respaldo FMP */ }
  // Respaldo: Financial Modeling Prep, SOLO si AV no tiene nada para este
  // ticker (AV cubre bastantes valores grandes; FMP cubre otros que AV no —
  // ninguna de las dos cubre el 100%, por eso se combinan en vez de sustituir).
  // Da el EPS estimado ANUAL directo (no hace falta sumar trimestres). Free
  // tier de FMP: máx. 10 registros por llamada y universo de símbolos propio.
  let annualEstimatesFMP = [];
  if (!quarterlyEstimates.length && process.env.FMP_API_KEY) {
    try {
      const url = `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${encodeURIComponent(sym)}&period=annual&limit=10&apikey=${process.env.FMP_API_KEY}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
      const j = await r.json();
      if (Array.isArray(j)) {
        annualEstimatesFMP = j.filter(e => e.date && num(e.epsAvg) != null).map(e => ({ date: e.date, eps: num(e.epsAvg) }));
      }
    } catch { /* tampoco disponible en FMP → este ticker se queda sin Fwd P/E histórico */ }
  }
  // EPS estimado a 12 meses vista DESDE una fecha: suma los 4 trimestres AV
  // cuyo cierre cae después de esa fecha (año fiscal siguiente completo), o si
  // AV no tiene datos, el primer ejercicio ANUAL de FMP que cierra después.
  // Margen de proximidad: si la fuente no cubre esa fecha, el siguiente dato
  // disponible puede estar años más adelante — usarlo daría un Fwd P/E FALSO
  // (precio de hace años ÷ estimación de un ejercicio muy posterior). Si el
  // primer trimestre/ejercicio disponible no empieza dentro de ~15 meses, se
  // considera que no hay cobertura real para esa fecha y se deja en null.
  const MAX_GAP_MS = 450 * 24 * 3600 * 1000;
  const forwardEpsFrom = (dateStr) => {
    if (!dateStr) return null;
    const t = new Date(dateStr).getTime();
    const nextQ = quarterlyEstimates.filter(q => new Date(q.date).getTime() > t).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (nextQ.length >= 4 && new Date(nextQ[0].date).getTime() - t <= MAX_GAP_MS) {
      return nextQ.slice(0, 4).reduce((s, q) => s + q.eps, 0);
    }
    const nextFMP = annualEstimatesFMP.filter(e => new Date(e.date).getTime() > t).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    if (nextFMP && new Date(nextFMP.date).getTime() - t <= MAX_GAP_MS) return nextFMP.eps;
    return null;
  };

  let valuationHistory = [];
  try {
    const hist = await getHistory(sym, '10y');
    const pricePts = hist?.points || [];
    const priceNear = (dateStr) => {
      if (!pricePts.length || !dateStr) return null;
      const target = new Date(dateStr).getTime();
      if (!Number.isFinite(target)) return null;
      let best = null, bestDiff = Infinity;
      for (const p of pricePts) {
        const diff = Math.abs(p.t - target);
        if (diff < bestDiff) { bestDiff = diff; best = p; }
      }
      return (best && bestDiff <= 12 * 24 * 3600 * 1000) ? best.close : null; // ~12 días de margen (barras semanales en 5y)
    };
    const byYear = (reports) => {
      const map = {};
      (reports || []).forEach(r => { const y = r.fiscalDateEnding?.slice(0, 4); if (y) map[y] = r; });
      return map;
    };
    const incY = byYear(income.annualReports), balY = byYear(balance.annualReports), cashY = byYear(cash.annualReports);
    const years = Object.keys(incY).filter(y => balY[y]).sort((a, b) => b - a).slice(0, 10);
    valuationHistory = years.map(y => {
      const ir = incY[y], br = balY[y], cr = cashY[y] || {};
      const px = priceNear(ir.fiscalDateEnding);
      const sh = num(br.commonStockSharesOutstanding);
      const ni = num(ir.netIncome);
      const eq = num(br.totalShareholderEquity);
      const rev = num(ir.totalRevenue);
      const gp = num(ir.grossProfit);
      const opInc = num(ir.ebit) ?? num(ir.operatingIncome);
      const ebitdaDirect = num(ir.ebitda); // AV lo da directo — más fiable que EBIT+D&A
      const daY = num(cr.depreciationDepletionAndAmortization);
      const stD = num(br.shortTermDebt), ltD = num(br.longTermDebt);
      const debtY = (stD != null || ltD != null) ? (stD || 0) + (ltD || 0) : null;
      const cashEqY = num(br.cashAndShortTermInvestments) ?? num(br.cashAndCashEquivalentsAtCarryingValue);
      const eps = (ni != null && sh) ? ni / sh : null;
      const bvps = (eq != null && sh) ? eq / sh : null;
      const mcapY = (px != null && sh) ? px * sh : null;
      const ebitdaY = ebitdaDirect ?? (opInc != null ? opInc + (daY || 0) : null);
      const evY = (mcapY != null && debtY != null) ? mcapY + debtY - (cashEqY || 0) : null;
      const fwdEps = forwardEpsFrom(ir.fiscalDateEnding);
      return {
        year: y,
        price: px != null ? +px.toFixed(2) : null,
        eps, // interno, para el crecimiento interanual (PEG) — no se muestra directamente
        pe: (px != null && eps > 0) ? +(px / eps).toFixed(2) : null,
        fpe: (px != null && fwdEps > 0) ? +(px / fwdEps).toFixed(2) : null,
        pb: (px != null && bvps > 0) ? +(px / bvps).toFixed(2) : null,
        evEbitda: (evY != null && ebitdaY > 0) ? +(evY / ebitdaY).toFixed(2) : null,
        roe: (ni != null && eq) ? +((ni / eq) * 100).toFixed(2) : null,
        netMargin: (ni != null && rev) ? +((ni / rev) * 100).toFixed(2) : null,
        grossMargin: (gp != null && rev) ? +((gp / rev) * 100).toFixed(2) : null,
        debtToEquity: (debtY != null && eq) ? +(debtY / eq).toFixed(2) : null,
      };
    });
    // PEG histórico = P/E ÷ crecimiento interanual del EPS (TRAILING, no forward:
    // el PEG "oficial" de Alpha Vantage usa estimaciones de analistas de HOY, que
    // no tenemos con retroactividad — este es el único PEG que se puede calcular
    // con datos reales año a año). Compara cada año con el inmediatamente anterior
    // (el array va de más reciente a más antiguo → el "anterior" es el siguiente índice).
    valuationHistory.forEach((r, i) => {
      const prev = valuationHistory[i + 1];
      const epsGrowth = (r.eps != null && prev?.eps > 0) ? (r.eps / prev.eps - 1) * 100 : null;
      // Umbral mínimo de crecimiento (2%): con crecimiento casi nulo el PEG
      // (P/E entre un número casi cero) se dispara a valores absurdos y deja de
      // ser informativo — práctica habitual es no mostrarlo en ese caso.
      r.peg = (r.pe != null && epsGrowth != null && epsGrowth > 2) ? +(r.pe / epsGrowth).toFixed(2) : null;
      delete r.eps; // interno, no se expone
    });
    valuationHistory = valuationHistory.filter(r => r.pe != null || r.fpe != null || r.pb != null || r.evEbitda != null || r.roe != null);
  } catch { /* histórico de precio no disponible → sin evolución, no rompe el resto */ }

  const shares = num(overview.SharesOutstanding);
  const beta = num(overview.Beta);
  let debt = num(bal.shortLongTermDebtTotal);
  if (debt == null) {
    const st = num(bal.shortTermDebt), lt = num(bal.longTermDebt);
    debt = (st != null || lt != null) ? (st || 0) + (lt || 0) : null;
  }
  const cashEq = num(bal.cashAndShortTermInvestments) ?? num(bal.cashAndCashEquivalentsAtCarryingValue);
  const netDebt = (debt != null) ? debt - (cashEq || 0) : null;

  // ROIC = NOPAT / capital invertido ; NOPAT = EBIT·(1−tasa impositiva)
  const ebit = num(inc.ebit) ?? num(inc.operatingIncome);
  const pretax = num(inc.incomeBeforeTax);
  const taxExp = num(inc.incomeTaxExpense);
  const taxRate = (pretax && taxExp != null && pretax !== 0) ? Math.max(0, Math.min(0.5, taxExp / pretax)) : 0.21;
  const equity = num(bal.totalShareholderEquity);
  const investedCapital = (equity != null && debt != null) ? equity + debt - (cashEq || 0) : null;
  const nopat = ebit != null ? ebit * (1 - taxRate) : null;
  const roic = (nopat != null && investedCapital && investedCapital > 0) ? +((nopat / investedCapital) * 100).toFixed(2) : null;

  // FCF yield = FCF / capitalización (valor de mercado del equity)
  const marketCap = (price != null && shares != null && shares > 0) ? price * shares : null;
  const fcfy = (fcf != null && marketCap && marketCap > 0) ? +((fcf / marketCap) * 100).toFixed(2) : null;

  // ─── Altman Z-Score (riesgo de quiebra, horizonte ~24 meses) ─────────────
  // Fórmula estándar para cotizadas (Altman 1968/2000):
  // Z = 1.2·(WC/TA) + 1.4·(RE/TA) + 3.3·(EBIT/TA) + 0.6·(MktCap/TotalLiab) + 1.0·(Sales/TA)
  // Zonas: Z > 2.99 segura · 1.81–2.99 gris · Z < 1.81 distress. Un solo
  // ejercicio basta (a diferencia de Piotroski/Beneish, que comparan 2 años).
  const totalAssets = num(bal.totalAssets);
  const totalLiabilities = num(bal.totalLiabilities);
  const workingCapital = (num(bal.totalCurrentAssets) != null && num(bal.totalCurrentLiabilities) != null)
    ? num(bal.totalCurrentAssets) - num(bal.totalCurrentLiabilities) : null;
  const retainedEarnings = num(bal.retainedEarnings);
  let altmanZ = null;
  if (totalAssets && workingCapital != null && retainedEarnings != null
      && ebit != null && totalLiabilities && marketCap != null && revenue) {
    altmanZ = +(
      1.2 * (workingCapital / totalAssets) +
      1.4 * (retainedEarnings / totalAssets) +
      3.3 * (ebit / totalAssets) +
      0.6 * (marketCap / totalLiabilities) +
      1.0 * (revenue / totalAssets)
    ).toFixed(2);
  }

  // ─── Piotroski F-Score (0-9, calidad/fortaleza del balance) ──────────────
  // 9 tests binarios comparando el ejercicio actual (t) contra el anterior
  // (t-1) — filtro clásico contra "value traps" (barato pero deteriorándose).
  // Todo o nada: si falta cualquier input de los dos años, queda en null en
  // vez de un score parcial engañoso (no tiene sentido "medio test binario").
  let piotroskiF = null;
  {
    const ta0 = totalAssets, ta1 = num(bal1.totalAssets);
    const ni0 = num(inc.netIncome), ni1 = num(inc1.netIncome);
    const cfo0 = ocf, cfo1 = num(cf1.operatingCashflow);
    const ltd0 = num(bal.longTermDebt), ltd1 = num(bal1.longTermDebt);
    const ca0 = num(bal.totalCurrentAssets), ca1 = num(bal1.totalCurrentAssets);
    const cl0 = num(bal.totalCurrentLiabilities), cl1 = num(bal1.totalCurrentLiabilities);
    const sh0 = num(bal.commonStockSharesOutstanding), sh1 = num(bal1.commonStockSharesOutstanding);
    const gp0 = num(inc.grossProfit), gp1 = num(inc1.grossProfit);
    const rev0 = revenue, rev1 = num(inc1.totalRevenue);
    if (ta0 && ta1 && ni0 != null && ni1 != null && cfo0 != null && cfo1 != null
        && ltd0 != null && ltd1 != null && ca0 != null && ca1 != null && cl0 && cl1
        && sh0 != null && sh1 != null && gp0 != null && gp1 != null && rev0 && rev1) {
      const roa0 = ni0 / ta0, roa1 = ni1 / ta1;
      const cr0 = ca0 / cl0, cr1 = ca1 / cl1;
      const lev0 = ltd0 / ta0, lev1 = ltd1 / ta1;
      const gm0 = gp0 / rev0, gm1 = gp1 / rev1;
      const at0 = rev0 / ta0, at1 = rev1 / ta1;
      let f = 0;
      if (roa0 > 0) f++;              // 1. rentable
      if (cfo0 > 0) f++;              // 2. caja operativa positiva
      if (roa0 > roa1) f++;           // 3. rentabilidad mejora
      if (cfo0 > ni0) f++;            // 4. calidad de earnings (caja > contable)
      if (lev0 < lev1) f++;           // 5. menos apalancamiento
      if (cr0 > cr1) f++;             // 6. más liquidez corriente
      if (sh0 <= sh1) f++;            // 7. sin nueva dilución
      if (gm0 > gm1) f++;             // 8. margen bruto mejora
      if (at0 > at1) f++;             // 9. eficiencia de activos mejora
      piotroskiF = f;
    }
  }

  // ─── Beneish M-Score (detección de manipulación contable, modelo 1999) ───
  // 8 variables (DSRI/GMI/AQI/SGI/DEPI/SGAI/TATA/LVGI). M > -1.78 sugiere
  // riesgo elevado de manipulación de resultados. TODO O NADA (mismo criterio
  // que Piotroski, más abajo): si falta cualquiera de las 8 variables (dato
  // ausente o denominador 0), el score entero queda en null. Antes cada
  // componente ausente degradaba a un valor "neutro" (1.0, o 0 en TATA) y la
  // suma de neutros caía por debajo del umbral de alarma → badge VERDE de
  // "sin riesgo de manipulación" para un ticker del que apenas había datos.
  let beneishM = null;
  {
    const div = (a, b) => (a != null && b != null && b !== 0) ? a / b : null;
    const ta1 = num(bal1.totalAssets), rev1 = num(inc1.totalRevenue);
    const netRecv0 = num(bal.currentNetReceivables), netRecv1 = num(bal1.currentNetReceivables);
    const gp0 = num(inc.grossProfit), gp1 = num(inc1.grossProfit);
    const ca0 = num(bal.totalCurrentAssets), ca1 = num(bal1.totalCurrentAssets);
    const ppe0 = num(bal.propertyPlantEquipment), ppe1 = num(bal1.propertyPlantEquipment);
    const dep0 = num(cf.depreciationDepletionAndAmortization), dep1 = num(cf1.depreciationDepletionAndAmortization);
    // Nombre alineado con el campo NATIVO de AV INCOME_STATEMENT (sin "Expenses").
    const sga0 = num(inc.sellingGeneralAndAdministrative), sga1 = num(inc1.sellingGeneralAndAdministrative);
    const ltd0 = num(bal.longTermDebt), ltd1 = num(bal1.longTermDebt);
    const cl0 = num(bal.totalCurrentLiabilities), cl1 = num(bal1.totalCurrentLiabilities);
    const ni0 = num(inc.netIncome);

    const dsri = div(div(netRecv0, revenue), div(netRecv1, rev1));
    const gmi = div(div(gp1, rev1), div(gp0, revenue));
    const aq0 = (totalAssets && ca0 != null && ppe0 != null) ? 1 - ((ca0 + ppe0) / totalAssets) : null;
    const aq1 = (ta1 && ca1 != null && ppe1 != null) ? 1 - ((ca1 + ppe1) / ta1) : null;
    const aqi = div(aq0, aq1);
    const sgi = div(revenue, rev1);
    const depRate0 = div(dep0, (ppe0 != null && dep0 != null) ? ppe0 + dep0 : null);
    const depRate1 = div(dep1, (ppe1 != null && dep1 != null) ? ppe1 + dep1 : null);
    const depi = div(depRate1, depRate0);
    const sgai = div(div(sga0, revenue), div(sga1, rev1));
    const tata = (totalAssets && ni0 != null && ocf != null) ? (ni0 - ocf) / totalAssets : null;
    const lev0 = (totalAssets && ltd0 != null && cl0 != null) ? (ltd0 + cl0) / totalAssets : null;
    const lev1 = (ta1 && ltd1 != null && cl1 != null) ? (ltd1 + cl1) / ta1 : null;
    const lvgi = div(lev0, lev1);

    if ([dsri, gmi, aqi, sgi, depi, sgai, tata, lvgi].every(v => v != null)) {
      beneishM = +(-4.84 + 0.920 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi
        + 0.115 * depi - 0.172 * sgai + 4.679 * tata - 0.327 * lvgi).toFixed(2);
    }
  }

  // WACC = We·ke + Wd·kd·(1−tax). ke por CAPM (rf + β·ERP). rf = 10Y del
  // Tesoro EN VIVO (Yahoo ^TNX, mismo símbolo que usa /api/macro), no un
  // supuesto fijo — más preciso en regímenes de tipos altos/bajos. Si la
  // cotización falla, cae al 4% de siempre (no rompe el cálculo).
  // ERP 5%, coste de deuda 5%. Sin estructura de deuda → WACC = coste de equity.
  let RF = 0.04;
  try {
    const q10y = await getQuote('^TNX');
    if (q10y?.price != null && Number.isFinite(q10y.price)) RF = q10y.price / 100;
  } catch { /* rf en vivo no disponible → se mantiene el 4% de respaldo */ }
  const ERP = 0.05, KD = 0.05;
  let costEquity = null, wacc = null;
  if (beta != null) {
    costEquity = RF + beta * ERP;
    if (marketCap != null && debt != null && marketCap + debt > 0) {
      const we = marketCap / (marketCap + debt), wd = debt / (marketCap + debt);
      wacc = +((we * costEquity + wd * KD * (1 - taxRate)) * 100).toFixed(2);
    } else {
      wacc = +(costEquity * 100).toFixed(2);
    }
    costEquity = +(costEquity * 100).toFixed(2);
  }

  // ── Quick-wins coste 0 del OVERVIEW (ya descargado) ──────────────────────
  // Consenso de analistas GRATIS: respaldo cuando Yahoo (estimates.js) falla
  // por crumb. Buckets de rating → recommendationKey compatible con la UI.
  const rt = {
    strong_buy:  num(overview.AnalystRatingStrongBuy) || 0,
    buy:         num(overview.AnalystRatingBuy) || 0,
    hold:        num(overview.AnalystRatingHold) || 0,
    sell:        num(overview.AnalystRatingSell) || 0,
    strong_sell: num(overview.AnalystRatingStrongSell) || 0,
  };
  const nRatings = rt.strong_buy + rt.buy + rt.hold + rt.sell + rt.strong_sell;
  const ratingMean = nRatings
    ? (rt.strong_buy + 2 * rt.buy + 3 * rt.hold + 4 * rt.sell + 5 * rt.strong_sell) / nRatings
    : null;
  const recKey = ratingMean == null ? null
    : ratingMean <= 1.5 ? 'strong_buy'
    : ratingMean <= 2.5 ? 'buy'
    : ratingMean <= 3.5 ? 'hold'
    : ratingMean <= 4.5 ? 'sell'
    : 'strong_sell';
  const consensus = {
    targetMean: num(overview.AnalystTargetPrice),
    recommendation: recKey,
    numAnalysts: nRatings || null,
  };
  // Rentabilidad por dividendo: AV la da como fracción (0.0052) → %.
  const dyRaw = num(overview.DividendYield);
  const dividendYield = dyRaw == null ? null : +(dyRaw * 100).toFixed(2);

  // Medias móviles 50/200 (OVERVIEW) → señal de tendencia.
  const ma50 = num(overview['50DayMovingAverage']);
  const ma200 = num(overview['200DayMovingAverage']);

  // Shareholder yield = (recompras + dividendos pagados) / capitalización.
  const buybacks = num(cf.paymentsForRepurchaseOfCommonStock) ?? num(cf.paymentsForRepurchaseOfEquity);
  const divPaid = num(cf.dividendPayout);
  const shYield = (marketCap && marketCap > 0 && (buybacks != null || divPaid != null))
    ? +((((buybacks || 0) + (divPaid || 0)) / marketCap) * 100).toFixed(2) : null;

  // Recompra NETA de dilución = (recompras − emisión de acciones) / capitalización.
  // A diferencia de shYield (que solo suma, sin descontar la dilución vía SBC/
  // ampliaciones), esta métrica resta lo que la empresa emite — una recompra
  // "de cara a la galería" financiada con nueva emisión de acciones da ~0%.
  const issuance = num(cf.proceedsFromIssuanceOfCommonStock);
  const netBuybackYield = (marketCap && marketCap > 0 && (buybacks != null || issuance != null))
    ? +((((buybacks || 0) - (issuance || 0)) / marketCap) * 100).toFixed(2) : null;

  // Dilución vs recompra: variación % del nº de acciones (BALANCE_SHEET, hasta 5a).
  // Negativo = recompra (reduce acciones, bueno) · positivo = dilución.
  const shareSeries = (balance.annualReports || []).slice(0, 5)
    .map(r => num(r.commonStockSharesOutstanding))
    .filter(v => v != null && v > 0);
  let sharesChg = null;
  if (shareSeries.length >= 2) {
    const newest = shareSeries[0], oldest = shareSeries[shareSeries.length - 1];
    sharesChg = +(((newest / oldest) - 1) * 100).toFixed(1);
  }

  const data = {
    ticker: sym,
    name: overview.Name || sym,
    sector: overview.Sector || null,
    price: price != null ? +price.toFixed(2) : null,
    sharesOutstanding: shares,
    beta,
    fcf,
    fcfHistory,
    fcfCAGR,
    // FCF ajustado por SBC — null si la fuente no separa esa línea (ruta AV)
    sbc,
    fcfAdjusted,
    fcfGrowth: rg.growth,            // crecimiento robusto (regresión) — autocompleta el modelo
    fcfGrowthLow: rg.low,
    fcfGrowthHigh: rg.high,
    fcfGrowthMethod: rg.method,
    fcfGrowthYears: rg.nYears,
    debt,
    cash: cashEq,
    netDebt,
    ebit,
    taxRate: +(taxRate * 100).toFixed(1),
    investedCapital,
    nopat,
    roic,
    marketCap,
    fcfy,
    costEquity,
    wacc,
    roe: num(overview.ReturnOnEquityTTM) != null ? +(num(overview.ReturnOnEquityTTM) * 100).toFixed(1) : null,
    // Salud financiera / riesgo de solvencia (quiebra, calidad de balance, manipulación contable)
    altmanZ,
    piotroskiF,
    beneishM,
    // CapEx — gastos de capital (en qué invierte la empresa)
    capex,
    capexToRevenue,
    capexToOCF,
    capexToDA,
    capexHistory,
    capexProfile,
    // CapEx de mantenimiento (≈D&A) vs crecimiento (heurística Greenwald)
    maintenanceCapex,
    growthCapex,
    // Evolución de múltiplos de valoración y calidad por ejercicio fiscal (hasta 5 años)
    valuationHistory,
    // Quick-wins coste 0 (OVERVIEW): consenso de analistas (respaldo gratis de
    // Yahoo) y rentabilidad por dividendo.
    consensus,
    dividendYield,
    // Tendencia (medias móviles) y retribución al accionista (recompras +
    // dividendos) + dilución (variación nº de acciones).
    ma50,
    ma200,
    shYield,
    netBuybackYield,
    sharesChg,
    // Antigüedad del dato fuente (para el badge de procedencia) + qué
    // proveedor lo sirvió ('av' | 'fmp', respaldo solo si AV falló/no cubría).
    fetchedAt,
    source,
  };
  cache.set(sym, { ts: Date.now(), data });
  return data;
}
