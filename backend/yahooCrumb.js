// ─────────────────────────────────────────────────────────────
// Cookie + crumb de Yahoo, compartido por los módulos que usan
// endpoints autenticados (quoteSummary, options). Crumb cacheado 30 min.
// ─────────────────────────────────────────────────────────────
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

let crumbCache = { val: null, cookie: null, ts: 0 };
const CRUMB_TTL = 30 * 60 * 1000;

export async function ensureCrumb() {
  if (crumbCache.val && Date.now() - crumbCache.ts < CRUMB_TTL) return crumbCache;
  // fc.yahoo.com responde 404 pero envía Set-Cookie
  const r1 = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA } });
  const list = typeof r1.headers.getSetCookie === 'function'
    ? r1.headers.getSetCookie()
    : [r1.headers.get('set-cookie')].filter(Boolean);
  const cookie = list.map(c => c.split(';')[0]).join('; ');
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, 'Cookie': cookie } });
  const val = (await r2.text()).trim();
  if (!val || val.length > 32) throw new Error('No se pudo obtener crumb de Yahoo');
  crumbCache = { val, cookie, ts: Date.now() };
  return crumbCache;
}
