// ─────────────────────────────────────────────────────────────
// Proxy de Alpha Vantage. Combina GLOBAL_QUOTE + OVERVIEW y
// normaliza la respuesta al formato de campos del formulario.
// La clave nunca sale del servidor.
// ─────────────────────────────────────────────────────────────
const KEY = process.env.ALPHA_VANTAGE_KEY || 'VAN3GADW10EX9IFT';
const BASE = 'https://www.alphavantage.co/query';

const num = (v) => {
  if (v === undefined || v === null || v === 'None' || v === '-' || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const pct = (v) => { const n = num(v); return n === null ? null : +(n * 100).toFixed(1); };

function formatMcap(v) {
  const n = num(v);
  if (n === null) return null;
  if (n > 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n > 1e9)  return (n / 1e9).toFixed(0) + 'B';
  return (n / 1e6).toFixed(0) + 'M';
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function lookupTicker(ticker) {
  const sym = String(ticker || '').trim().toUpperCase();
  if (!sym) throw Object.assign(new Error('Ticker vacío'), { status: 400 });

  // Secuencial con pausa: la clave gratuita exige ≤1 petición/segundo.
  const qRes = await fetch(`${BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(sym)}&apikey=${KEY}`);
  const qData = await qRes.json();
  await sleep(1300);
  const oRes = await fetch(`${BASE}?function=OVERVIEW&symbol=${encodeURIComponent(sym)}&apikey=${KEY}`);
  const oData = await oRes.json();

  // Aviso de límite de la API (5 req/min en cuentas gratuitas)
  if (qData.Note || qData.Information || oData.Note || oData.Information) {
    throw Object.assign(new Error(qData.Note || qData.Information || oData.Note || oData.Information), { status: 429 });
  }

  const q = qData['Global Quote'] || {};
  const price = num(q['05. price']);
  if (price === null) {
    throw Object.assign(new Error('Ticker no encontrado. Prueba con el símbolo exacto (ej: AAPL, MU, NVDA).'), { status: 404 });
  }

  const gross = (oData.GrossProfitTTM && oData.RevenueTTM)
    ? +((num(oData.GrossProfitTTM) / num(oData.RevenueTTM)) * 100).toFixed(1) : null;

  return {
    found: true,
    ticker: sym,
    name: oData.Name || null,
    sector: oData.Sector || null,
    market: oData.Exchange || null,
    current: +price.toFixed(2),
    changePercent: q['10. change percent'] ? parseFloat(q['10. change percent']).toFixed(2) + '%' : '',
    pe: num(oData.PERatio),
    fpe: num(oData.ForwardPE),
    pb: num(oData.PriceToBookRatio),
    peg: num(oData.PEGRatio),
    evebitda: num(oData.EVToEBITDA),
    ps: num(oData.PriceToSalesRatioTTM),
    eps: num(oData.EPS),
    epsd: num(oData.DilutedEPSTTM),
    epsny: num(oData.ForwardEPS),
    epsg: num(oData.QuarterlyEarningsGrowthYOY),
    roe: pct(oData.ReturnOnEquityTTM),
    roa: pct(oData.ReturnOnAssetsTTM),
    gm: gross,
    om: pct(oData.OperatingMarginTTM),
    nm: pct(oData.ProfitMargin),
    beta: num(oData.Beta),
    w52h: num(oData['52WeekHigh']),
    w52l: num(oData['52WeekLow']),
    mcap: formatMcap(oData.MarketCapitalization),
  };
}
