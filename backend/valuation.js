// ─────────────────────────────────────────────────────────────
// Autocompletado de fundamentales para la calculadora DCF / ROIC.
// Precio en vivo vía Yahoo (gratis). Fundamentales vía Alpha Vantage
// (OVERVIEW + CASH_FLOW + INCOME_STATEMENT + BALANCE_SHEET): 4 llamadas,
// secuenciales con pausa (clave gratuita ≤1 req/s, 25/día). Cache 24h
// por ticker. Si AV agota cuota, se devuelve {limited:true} y la
// calculadora sigue funcionando en modo manual.
// ─────────────────────────────────────────────────────────────
import { getQuote } from './sectors.js';
import { avQuery } from './avCache.js';

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

export async function getFundamentals(ticker) {
  const sym = String(ticker || '').trim().toUpperCase();
  if (!sym) throw Object.assign(new Error('Ticker vacío'), { status: 400 });
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  // Precio en vivo (Yahoo, no gasta cuota de Alpha Vantage)
  let price = null;
  try { const q = await getQuote(sym); price = q.price; } catch { /* sin precio */ }

  // Cada llamada pasa por la caché global (avCache): TTL por tipo, throttle y
  // resiliencia (si AV agota cuota sin copia previa, lanza 429 {limited}). Se
  // captura `fetchedAt` de cada una para mostrar la antigüedad del dato fuente.
  const ovR = await avQuery('OVERVIEW', sym), overview = ovR.data;
  const cashR = await avQuery('CASH_FLOW', sym), cash = cashR.data;
  const incR = await avQuery('INCOME_STATEMENT', sym), income = incR.data;
  const balR = await avQuery('BALANCE_SHEET', sym), balance = balR.data;
  // Antigüedad = la del dato MÁS VIEJO de los cuatro (el más conservador).
  const fetchedAt = [ovR, cashR, incR, balR].map(r => r.fetchedAt).filter(Boolean).sort()[0] || null;

  const cf = cash.annualReports?.[0] || {};
  const inc = income.annualReports?.[0] || {};
  const bal = balance.annualReports?.[0] || {};

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

  // CAGR de 2 extremos (legacy, se conserva para transparencia/comparación)
  let fcfCAGR = null;
  if (fcfHistory.length >= 2) {
    const newest = fcfHistory[0].fcf, oldest = fcfHistory[fcfHistory.length - 1].fcf, yrs = fcfHistory.length - 1;
    if (newest > 0 && oldest > 0) fcfCAGR = +(((Math.pow(newest / oldest, 1 / yrs)) - 1) * 100).toFixed(1);
  }
  // Crecimiento ROBUSTO (regresión log-lineal) → el que autocompleta el modelo
  const rg = robustGrowth(fcfHistory);

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

  // WACC = We·ke + Wd·kd·(1−tax). ke por CAPM (rf + β·ERP). Supuestos: rf 4%,
  // ERP 5%, coste de deuda 5%. Sin estructura de deuda → WACC = coste de equity.
  const RF = 0.04, ERP = 0.05, KD = 0.05;
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
    // CapEx — gastos de capital (en qué invierte la empresa)
    capex,
    capexToRevenue,
    capexToOCF,
    capexToDA,
    capexHistory,
    capexProfile,
    // Quick-wins coste 0 (OVERVIEW): consenso de analistas (respaldo gratis de
    // Yahoo) y rentabilidad por dividendo.
    consensus,
    dividendYield,
    // Tendencia (medias móviles) y retribución al accionista (recompras +
    // dividendos) + dilución (variación nº de acciones).
    ma50,
    ma200,
    shYield,
    sharesChg,
    // Antigüedad del dato fuente de AV (para el badge de procedencia).
    fetchedAt,
  };
  cache.set(sym, { ts: Date.now(), data });
  return data;
}
