// ─────────────────────────────────────────────────────────────
// Autocompletado de fundamentales para la calculadora DCF / ROIC.
// Precio en vivo vía Yahoo (gratis). Fundamentales vía Alpha Vantage
// (OVERVIEW + CASH_FLOW + INCOME_STATEMENT + BALANCE_SHEET): 4 llamadas,
// secuenciales con pausa (clave gratuita ≤1 req/s, 25/día). Cache 24h
// por ticker. Si AV agota cuota, se devuelve {limited:true} y la
// calculadora sigue funcionando en modo manual.
// ─────────────────────────────────────────────────────────────
import { getQuote } from './sectors.js';

const KEY = process.env.ALPHA_VANTAGE_KEY;
const BASE = 'https://www.alphavantage.co/query';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const num = (v) => {
  if (v === undefined || v === null || v === 'None' || v === '' || v === '-') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

async function av(fn, sym) {
  const r = await fetch(`${BASE}?function=${fn}&symbol=${encodeURIComponent(sym)}&apikey=${KEY}`, { signal: AbortSignal.timeout(9000) });
  const j = await r.json();
  if (j.Note || j.Information) {
    throw Object.assign(new Error('Límite de Alpha Vantage alcanzado (25/día). Introduce los datos a mano.'), { status: 429, limited: true });
  }
  return j;
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

  const overview = await av('OVERVIEW', sym);
  await sleep(1300);
  const cash = await av('CASH_FLOW', sym);
  await sleep(1300);
  const income = await av('INCOME_STATEMENT', sym);
  await sleep(1300);
  const balance = await av('BALANCE_SHEET', sym);

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

  // CAGR histórico del FCF (de más antiguo a más reciente)
  let fcfCAGR = null;
  if (fcfHistory.length >= 2) {
    const newest = fcfHistory[0].fcf, oldest = fcfHistory[fcfHistory.length - 1].fcf, yrs = fcfHistory.length - 1;
    if (newest > 0 && oldest > 0) fcfCAGR = +(((Math.pow(newest / oldest, 1 / yrs)) - 1) * 100).toFixed(1);
  }

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
    debt,
    cash: cashEq,
    netDebt,
    ebit,
    taxRate: +(taxRate * 100).toFixed(1),
    investedCapital,
    nopat,
    roic,
    roe: num(overview.ReturnOnEquityTTM) != null ? +(num(overview.ReturnOnEquityTTM) * 100).toFixed(1) : null,
  };
  cache.set(sym, { ts: Date.now(), data });
  return data;
}
