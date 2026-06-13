// ─────────────────────────────────────────────────────────────
// Análisis de GAMMA de opciones (GEX — Gamma Exposure).
// A partir de la cadena de opciones de Yahoo (open interest + IV por strike)
// calcula la gamma Black-Scholes de cada contrato y la exposición gamma de
// los dealers. Convención (SqueezeMetrics): dealers LARGOS de calls, CORTOS
// de puts → GEX = Σ(γ_call·OI_call − γ_put·OI_put)·100·S²·0.01.
//   · GEX neto > 0 → dealers gamma larga (mercado se "pega", baja volatilidad)
//   · GEX neto < 0 → dealers gamma corta (movimientos se amplifican)
//   · Gamma flip   → precio donde la GEX total cruza cero
//   · Call/Put wall→ strikes con mayor gamma (resistencia / soporte)
// Endpoint autenticado (cookie+crumb). Cache 10 min. NO gasta cuota AV.
// ─────────────────────────────────────────────────────────────
import { yahooSymbol } from './sectors.js';
import { UA, ensureCrumb } from './yahooCrumb.js';

const RF = 0.04;                 // tasa libre de riesgo
const CONTRACT = 100;            // multiplicador por contrato
const pdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

// Gamma Black-Scholes de una opción (igual para call y put)
function bsGamma(S, K, T, sigma) {
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(sigma > 0)) return 0;
  const d1 = (Math.log(S / K) + (RF + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return pdf(d1) / (S * sigma * Math.sqrt(T));
}

// GEX neto de los dealers a un precio hipotético `p` (para hallar el flip)
function netGexAt(p, rows, T) {
  let g = 0;
  for (const r of rows) {
    const gc = bsGamma(p, r.strike, T, r.callIV) * r.callOI;
    const gp = bsGamma(p, r.strike, T, r.putIV) * r.putOI;
    g += (gc - gp);
  }
  return g * CONTRACT * p * p * 0.01;
}

async function fetchChainJson(sym, date) {
  const { val, cookie } = await ensureCrumb();
  const u = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}?crumb=${encodeURIComponent(val)}${date ? `&date=${date}` : ''}`;
  const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json', 'Cookie': cookie }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`Yahoo options HTTP ${r.status}`);
  const j = await r.json();
  const res = j?.optionChain?.result?.[0];
  if (!res) throw new Error('Respuesta de opciones vacía');
  return res;
}

// Construye un "tramo" (leg) = un vencimiento con sus filas por strike y su T.
function buildLeg(chain) {
  if (!chain) return null;
  const days = Math.max((chain.expirationDate * 1000 - Date.now()) / 86400000, 0.5);
  const T = days / 365;
  const byStrike = new Map();
  const put = (k) => byStrike.get(k) || byStrike.set(k, { strike: k, callOI: 0, putOI: 0, callIV: 0, putIV: 0 }).get(k);
  for (const c of chain.calls || []) { const r = put(c.strike); r.callOI = c.openInterest || 0; r.callIV = c.impliedVolatility || 0; }
  for (const p of chain.puts || []) { const r = put(p.strike); r.putOI = p.openInterest || 0; r.putIV = p.impliedVolatility || 0; }
  const rows = [...byStrike.values()].filter(r => r.strike > 0 && (r.callOI > 0 || r.putOI > 0));
  if (rows.length < 3) return null;
  return { rows, T, days, expirationDate: chain.expirationDate };
}

// GEX por strike al precio actual, SUMANDO todos los tramos (single o agregado).
// Los walls = strike con mayor gamma·OI agregada a través de los vencimientos.
function computeGEX(spot, legs) {
  const map = new Map();
  let netGEX = 0, callOItot = 0, putOItot = 0;
  for (const { rows, T } of legs) {
    for (const r of rows) {
      const gc = bsGamma(spot, r.strike, T, r.callIV);
      const gp = bsGamma(spot, r.strike, T, r.putIV);
      const callGEX = gc * r.callOI * CONTRACT * spot * spot * 0.01;
      const putGEX = -gp * r.putOI * CONTRACT * spot * spot * 0.01; // dealers cortos de puts
      const net = callGEX + putGEX;
      netGEX += net; callOItot += r.callOI; putOItot += r.putOI;
      const e = map.get(r.strike) || { strike: r.strike, callOI: 0, putOI: 0, net: 0, cw: 0, pw: 0 };
      e.callOI += r.callOI; e.putOI += r.putOI; e.net += net;
      e.cw += gc * r.callOI; e.pw += gp * r.putOI;
      map.set(r.strike, e);
    }
  }
  let callWall = null, putWall = null;
  for (const e of map.values()) {
    if (!callWall || e.cw > callWall._m) callWall = { strike: e.strike, _m: e.cw };
    if (!putWall || e.pw > putWall._m) putWall = { strike: e.strike, _m: e.pw };
  }
  const strikes = [...map.values()]
    .map(e => ({ strike: e.strike, callOI: e.callOI, putOI: e.putOI, netGEX: +e.net.toFixed(0) }))
    .sort((a, b) => a.strike - b.strike);
  return { netGEX, callOItot, putOItot, callWall, putWall, strikes };
}

const MAX_EXP_AGG = 8; // vencimientos máximos a agregar (control de latencia serverless)
const cache = new Map();
const TTL = 10 * 60 * 1000;

export async function getGamma(symbol, dateParam) {
  const sym = yahooSymbol(symbol);
  const aggregate = dateParam === 'all';
  const key = `${sym}|${aggregate ? 'all' : (dateParam || 'near')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  // Cadena base: la pedida (single) o la cercana (para spot + lista de venc.)
  const baseRes = await fetchChainJson(sym, aggregate ? undefined : (dateParam ? Number(dateParam) : undefined));
  const spot = baseRes.quote?.regularMarketPrice;
  if (!(spot > 0)) throw Object.assign(new Error('Sin precio de subyacente'), { status: 404 });
  const allExp = baseRes.expirationDates || [];

  // Tramos (legs): 1 en modo single; varios (vencimientos en paralelo) en agregado
  let legs = [];
  if (aggregate) {
    const dates = allExp.slice(0, MAX_EXP_AGG);
    const baseExp = baseRes.options?.[0]?.expirationDate;
    const settled = await Promise.allSettled(dates.map(d =>
      d === baseExp ? Promise.resolve(baseRes) : fetchChainJson(sym, d)
    ));
    for (const s of settled) {
      if (s.status !== 'fulfilled') continue;
      const leg = buildLeg(s.value.options?.[0]);
      if (leg) legs.push(leg);
    }
  } else {
    const leg = buildLeg(baseRes.options?.[0]);
    if (leg) legs.push(leg);
  }
  if (!legs.length) throw Object.assign(new Error(`Datos de opciones insuficientes para ${sym}`), { status: 404 });

  // GEX por strike al precio actual (suma de todos los tramos)
  const { netGEX, callOItot, putOItot, callWall, putWall, strikes } = computeGEX(spot, legs);

  // Ventana legible alrededor del spot (±25%)
  const lo = spot * 0.75, hi = spot * 1.25;
  const windowStrikes = strikes.filter(s => s.strike >= lo && s.strike <= hi);

  // Perfil de gamma: GEX total a distintos precios, SUMANDO todos los tramos. El
  // gamma flip es el precio donde la curva cruza cero (interpolación del 1er cruce).
  let gammaFlip = null;
  const pLo = spot * 0.7, pHi = spot * 1.3, steps = 80;
  const profile = [];
  let prevP = null, prevG = null;
  for (let i = 0; i <= steps; i++) {
    const p = pLo + (pHi - pLo) * (i / steps);
    let g = 0; for (const lg of legs) g += netGexAt(p, lg.rows, lg.T);
    profile.push({ p: +p.toFixed(2), g: +g.toFixed(0) });
    if (gammaFlip == null && prevG != null) {
      if (prevG === 0) gammaFlip = +prevP.toFixed(2);
      else if ((prevG < 0 && g > 0) || (prevG > 0 && g < 0)) {
        gammaFlip = +(prevP + (p - prevP) * (-prevG) / (g - prevG)).toFixed(2);
      }
    }
    prevP = p; prevG = g;
  }

  const expirations = allExp.slice(0, 12).map(d => ({
    date: d, label: new Date(d * 1000).toISOString().slice(0, 10),
  }));

  // Metadatos de vencimiento (single vs agregado)
  const legDays = legs.map(l => Math.round(l.days)).sort((a, b) => a - b);
  const single = !aggregate ? legs[0] : null;
  const data = {
    symbol: sym,
    spot: +spot.toFixed(2),
    aggregated: aggregate,
    nExpirations: legs.length,
    expiry: aggregate ? `Agregado (${legs.length} venc.)` : new Date(single.expirationDate * 1000).toISOString().slice(0, 10),
    expirationDate: aggregate ? null : single.expirationDate,
    daysToExpiry: aggregate ? null : Math.round(single.days),
    expiryRange: aggregate && legDays.length ? [legDays[0], legDays[legDays.length - 1]] : null,
    expirations,
    netGEX: +netGEX.toFixed(0),
    regime: netGEX >= 0 ? 'positive' : 'negative',
    gammaFlip,
    callWall: callWall ? callWall.strike : null,
    putWall: putWall ? putWall.strike : null,
    putCallOI: callOItot > 0 ? +(putOItot / callOItot).toFixed(2) : null,
    callOItot, putOItot,
    strikes: windowStrikes,
    profile,
  };
  cache.set(key, { ts: Date.now(), data });
  return data;
}
