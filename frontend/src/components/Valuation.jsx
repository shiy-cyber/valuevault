import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';

// m = millones. Formateo de dinero e importes por acción.
const fmtB = (m) => (m == null || isNaN(m)) ? '—' : Math.abs(m) >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${m.toFixed(0)}M`;
const fmtP = (v) => (v == null || isNaN(v)) ? '—' : `$${v.toFixed(2)}`;

const inputStyle = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '7px 9px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '13px' };

// Campo numérico a nivel de módulo (evita perder el foco en cada tecla)
function Field({ label, value, onChange, suffix, step, hint }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>{label}</label>
        {hint && <span style={{ fontSize: '9px', color: 'var(--muted)' }}>{hint}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
        <input type="number" value={value} step={step || 'any'} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} style={inputStyle} />
        {suffix && <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", whiteSpace: 'nowrap' }}>{suffix}</span>}
      </div>
    </div>
  );
}

const N = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

export default function Valuation({ toast }) {
  const { t } = useTranslation();
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState(null); // {name, sector, roicData, fcfCAGR}
  const [sbcInfo, setSbcInfo] = useState(null); // {fcf, sbc, fcfAdjusted} en $ (sin escalar)
  const [useSbcAdjusted, setUseSbcAdjusted] = useState(false);
  const [capexInfo, setCapexInfo] = useState(null); // {maintenance, growth} en $ (sin escalar)

  // Supuestos del modelo (FCF, deuda y acciones en millones)
  const [fcf0, setFcf0] = useState(1000);
  const [growth, setGrowth] = useState(8);
  const [years, setYears] = useState(5);
  const [termGrowth, setTermGrowth] = useState(2.5);
  const [wacc, setWacc] = useState(9);
  const [shares, setShares] = useState(1000);
  const [netDebt, setNetDebt] = useState(0);
  const [price, setPrice] = useState(100);
  const [roic, setRoic] = useState(15);

  // Ayuda WACC (CAPM)
  const [rf, setRf] = useState(4.3);
  const [beta, setBeta] = useState(1.1);
  const [erp, setErp] = useState(5);
  const ke = +(N(rf) + N(beta) * N(erp)).toFixed(2);

  // Prefijar el tipo libre de riesgo con el 10Y real del Tesoro (sección Macro)
  useEffect(() => {
    api.macro().then(m => {
      const tenY = m?.curve?.points?.find(p => p.key === '10Y')?.value;
      if (tenY != null) setRf(+Number(tenY).toFixed(2));
    }).catch(() => {});
  }, []);

  // ─── Autocompletar desde Alpha Vantage + Yahoo ──────────────
  const fetchData = async () => {
    const sym = ticker.trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    try {
      const d = await api.fundamentals(sym);
      if (d.fcf != null) setFcf0(+(d.fcf / 1e6).toFixed(0));
      // FCF ajustado por SBC (compensación en acciones) y desglose de CapEx
      // mantenimiento/crecimiento — null si la fuente no los cubre (degrada
      // con gracia, el toggle/nota simplemente no aparecen).
      setSbcInfo((d.sbc != null || d.fcfAdjusted != null) ? { fcf: d.fcf, sbc: d.sbc, fcfAdjusted: d.fcfAdjusted } : null);
      setUseSbcAdjusted(false);
      setCapexInfo((d.maintenanceCapex != null || d.growthCapex != null) ? { maintenance: d.maintenanceCapex, growth: d.growthCapex } : null);
      if (d.sharesOutstanding) setShares(+(d.sharesOutstanding / 1e6).toFixed(0));
      if (d.netDebt != null) setNetDebt(+(d.netDebt / 1e6).toFixed(0));
      if (d.price != null) setPrice(d.price);
      if (d.beta != null) setBeta(d.beta);
      if (d.roic != null) setRoic(d.roic);
      // Crecimiento ROBUSTO (regresión log-lineal del backend); cae al CAGR si falta
      const autoG = d.fcfGrowth != null ? d.fcfGrowth : d.fcfCAGR;
      if (autoG != null) setGrowth(Math.max(0, Math.min(15, autoG)));
      // WACC estimado por ESTRUCTURA DE CAPITAL (ke vía CAPM + peso de deuda,
      // ponderado con capitalización de MERCADO, no con el equity intrínseco)
      // → sustituye al 9% genérico. Lo calcula el backend en valuation.js.
      if (d.wacc != null) setWacc(d.wacc);
      setMeta({ name: d.name, sector: d.sector, roic: d.roic, fcfCAGR: d.fcfCAGR, fcfGrowth: d.fcfGrowth, fcfGrowthLow: d.fcfGrowthLow, fcfGrowthHigh: d.fcfGrowthHigh, fcfGrowthMethod: d.fcfGrowthMethod, fcfGrowthYears: d.fcfGrowthYears, roe: d.roe, wacc: d.wacc, costEquity: d.costEquity });
      toast?.(t('valuationPage.toastLoaded', { sym }));
    } catch (e) {
      toast?.(t('toast.error', { message: e.message || t('valuationPage.couldNotLoad') }));
    } finally { setLoading(false); }
  };

  // ─── Cálculo DCF ────────────────────────────────────────────
  const dcf = useMemo(() => {
    const g = N(growth) / 100, gt = N(termGrowth) / 100, w = N(wacc) / 100, n = Math.max(1, Math.min(15, N(years, 5)));
    const f0 = N(fcf0), sh = N(shares), nd = N(netDebt), p = N(price);
    if (w <= gt) return { error: t('valuationPage.errors.waccVsTerminal') };
    let pvSum = 0; const rows = []; let fN = f0;
    for (let y = 1; y <= n; y++) {
      fN = f0 * Math.pow(1 + g, y);
      const pv = fN / Math.pow(1 + w, y);
      pvSum += pv;
      rows.push({ y, fcf: fN, pv });
    }
    const tv = (fN * (1 + gt)) / (w - gt);
    const pvTv = tv / Math.pow(1 + w, n);
    const ev = pvSum + pvTv;
    const equity = ev - nd;
    const perShare = sh > 0 ? equity / sh : null;
    const upside = (perShare != null && p > 0) ? (perShare / p - 1) * 100 : null;
    const tvWeight = ev > 0 ? (pvTv / ev) * 100 : null; // % del EV que viene de la perpetuidad
    return { rows, pvSum, pvTv, tv, tvWeight, ev, equity, perShare, upside, n };
  }, [fcf0, growth, years, termGrowth, wacc, shares, netDebt, price, t]);

  // ─── Matriz de sensibilidad WACC × crecimiento terminal ─────
  // Reutiliza exactamente la misma matemática de PV/TV que `dcf`, variando
  // solo WACC (±2pp, pasos de 0.5) y g terminal (±1pp, pasos de 0.5) alrededor
  // de los inputs actuales — para ver de un vistazo cuán sensible es el valor
  // intrínseco a esos dos supuestos (los más discutibles del modelo).
  const WACC_OFFSETS = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
  const GT_OFFSETS = [-1, -0.5, 0, 0.5, 1];
  const sensitivity = useMemo(() => {
    const f0 = N(fcf0), sh = N(shares), nd = N(netDebt);
    const g = N(growth) / 100, n = Math.max(1, Math.min(15, N(years, 5)));
    const baseW = N(wacc), baseGt = N(termGrowth);
    if (sh <= 0) return null;
    const waccSteps = WACC_OFFSETS.map(d => +(baseW + d).toFixed(2));
    const gtSteps = GT_OFFSETS.map(d => +(baseGt + d).toFixed(2));
    const grid = waccSteps.map(wPct => {
      const w = wPct / 100;
      return gtSteps.map(gtPct => {
        const gt = gtPct / 100;
        if (w <= gt) return null;
        let pvSum = 0, fN = f0;
        for (let y = 1; y <= n; y++) { fN = f0 * Math.pow(1 + g, y); pvSum += fN / Math.pow(1 + w, y); }
        const tv = (fN * (1 + gt)) / (w - gt);
        const pvTv = tv / Math.pow(1 + w, n);
        const equity = pvSum + pvTv - nd;
        return equity / sh;
      });
    });
    return { waccSteps, gtSteps, grid };
  }, [fcf0, growth, years, termGrowth, wacc, shares, netDebt]);
  const CURRENT_ROW = WACC_OFFSETS.indexOf(0);
  const CURRENT_COL = GT_OFFSETS.indexOf(0);

  // Fiabilidad del crecimiento autocompletado: banda ancha (FCF volátil),
  // pocos años de histórico o crecimiento casi plano → avisar y pedir revisión.
  const gBand = (meta?.fcfGrowthHigh != null && meta?.fcfGrowthLow != null) ? meta.fcfGrowthHigh - meta.fcfGrowthLow : null;
  const gVolatile = gBand != null && gBand > 25;
  const gFew = meta?.fcfGrowthYears != null && meta.fcfGrowthYears < 3;
  const gFlat = meta?.fcfGrowth != null && meta.fcfGrowth < 1;
  const gWarn = !!meta && (gVolatile || gFew || gFlat);

  const spread = +(N(roic) - N(wacc)).toFixed(2);
  const cardBase = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' };
  const cap = { fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '14px' };

  const upColor = dcf.upside == null ? 'var(--muted)' : dcf.upside >= 0 ? 'var(--green)' : 'var(--red)';
  const verdict = dcf.upside == null ? '—'
    : dcf.upside >= 30 ? t('valuationPage.verdict.deepUndervalued')
    : dcf.upside >= 0 ? t('valuationPage.verdict.slightlyUndervalued')
    : dcf.upside >= -20 ? t('valuationPage.verdict.fairValue')
    : t('valuationPage.verdict.overvalued');
  // Margen de seguridad: cuánto por debajo del valor intrínseco cotiza el precio
  const mos = (dcf.perShare != null && dcf.perShare > 0 && N(price) > 0) ? (1 - N(price) / dcf.perShare) * 100 : null;
  const priceFrac = (dcf.perShare > 0 && N(price) > 0) ? Math.max(2, Math.min(140, (N(price) / dcf.perShare) * 100)) : null;

  return (
    <div className="section active">
      {/* Intro */}
      <div style={{ ...cardBase, borderLeft: '4px solid var(--gold)', marginBottom: '18px' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', marginBottom: '6px' }}>{t('valuationPage.title')}</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>{t('valuationPage.subtitlePrefix')} <b>{t('valuationPage.intrinsicValue')}</b> {t('valuationPage.subtitleMid')} <b>{t('valuationPage.roicVsWacc')}</b> {t('valuationPage.subtitleSuffix')}</div>
      </div>

      {/* Ticker */}
      <div style={{ ...cardBase, marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>{t('valuationPage.tickerLabel')}</label>
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && fetchData()} placeholder="AAPL, MSFT, NVDA…" style={{ ...inputStyle, marginTop: '4px', fontSize: '15px' }} />
          </div>
          <button className="btn btn-gold" onClick={fetchData} disabled={loading || !ticker.trim()}>{loading ? t('valuationPage.loading') : t('valuationPage.fetchData')}</button>
        </div>
        {meta && (
          <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>
            {meta.name}{meta.sector ? ` · ${meta.sector}` : ''}{meta.roic != null ? t('valuationPage.metaRoic', { value: meta.roic }) : ''}{meta.fcfGrowth != null ? t('valuationPage.metaFcfGrowth', { value: meta.fcfGrowth, method: meta.fcfGrowthMethod }) : (meta.fcfCAGR != null ? t('valuationPage.metaFcfCagr', { value: meta.fcfCAGR }) : '')}
          </div>
        )}
        <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--muted)' }}>{t('valuationPage.avQuotaNote')}</div>
      </div>

      {/* Inputs + Resultados */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: '16px', alignItems: 'start' }}>
        {/* INPUTS */}
        <div style={cardBase}>
          <div style={cap}>{t('valuationPage.modelAssumptions')}</div>
          <Field label={t('valuationPage.fields.fcf0')} value={fcf0} onChange={setFcf0} suffix="M$" hint={t('valuationPage.fields.fcf0Hint')} />
          {sbcInfo?.fcfAdjusted != null && (
            <div style={{ marginTop: '-6px', marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={useSbcAdjusted} onChange={e => {
                  const on = e.target.checked;
                  setUseSbcAdjusted(on);
                  setFcf0(+((on ? sbcInfo.fcfAdjusted : sbcInfo.fcf) / 1e6).toFixed(0));
                }} />
                {t('valuationPage.fields.useSbcAdjusted')}
              </label>
              <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '3px' }}>
                {t('valuationPage.fields.sbcNote', { fcf: fmtB(sbcInfo.fcf / 1e6), sbc: fmtB(sbcInfo.sbc / 1e6), adjusted: fmtB(sbcInfo.fcfAdjusted / 1e6) })}
              </div>
            </div>
          )}
          {capexInfo && (capexInfo.maintenance != null || capexInfo.growth != null) && (
            <div style={{ marginTop: '-6px', marginBottom: '12px', fontSize: '9px', color: 'var(--muted)' }}>
              {t('valuationPage.fields.capexSplitNote', { maint: fmtB((capexInfo.maintenance || 0) / 1e6), growth: fmtB((capexInfo.growth || 0) / 1e6) })}
            </div>
          )}
          <Field label={t('valuationPage.fields.growth')} value={growth} onChange={setGrowth} suffix={t('valuationPage.fields.growthSuffix')} />
          {gWarn && (
            <div style={{ marginTop: '-6px', marginBottom: '12px', padding: '7px 9px', background: 'rgba(230,126,34,.1)', borderRadius: '7px', fontSize: '10px', color: '#e67e22', fontFamily: "'DM Mono',monospace", lineHeight: 1.5 }}>
              {t('valuationPage.growthWarn.auto', { value: meta.fcfGrowth, method: meta.fcfGrowthMethod })}{gBand != null ? t('valuationPage.growthWarn.band', { low: meta.fcfGrowthLow, high: meta.fcfGrowthHigh }) : ''}). {gVolatile ? t('valuationPage.growthWarn.volatile') : gFew ? t('valuationPage.growthWarn.fewYears') : t('valuationPage.growthWarn.flat')} {t('valuationPage.growthWarn.suffix')}{gFlat && meta.roic != null ? t('valuationPage.growthWarn.roicNote', { roic: meta.roic, growth: meta.fcfGrowth }) : ''}.
            </div>
          )}
          <Field label={t('valuationPage.fields.years')} value={years} onChange={setYears} suffix={t('valuationPage.fields.yearsSuffix')} step="1" />
          <Field label={t('valuationPage.fields.termGrowth')} value={termGrowth} onChange={setTermGrowth} suffix="%" hint={t('valuationPage.fields.termGrowthHint')} />
          <Field label={t('valuationPage.fields.wacc')} value={wacc} onChange={setWacc} suffix="%" />
          <Field label={t('valuationPage.fields.shares')} value={shares} onChange={setShares} suffix="M" />
          <Field label={t('valuationPage.fields.netDebt')} value={netDebt} onChange={setNetDebt} suffix="M$" hint={t('valuationPage.fields.netDebtHint')} />
          <Field label={t('valuationPage.fields.price')} value={price} onChange={setPrice} suffix={t('valuationPage.fields.priceSuffix')} />

          {/* WACC helper */}
          <div style={{ marginTop: '6px', padding: '12px', background: 'var(--surface2)', borderRadius: '9px' }}>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', marginBottom: '10px', letterSpacing: '1px' }}>{t('valuationPage.waccHelp')}</div>
            <Field label={t('valuationPage.fields.rf')} value={rf} onChange={setRf} suffix="%" />
            <Field label={t('valuationPage.fields.beta')} value={beta} onChange={setBeta} suffix="β" />
            <Field label={t('valuationPage.fields.erp')} value={erp} onChange={setErp} suffix="%" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>{t('valuationPage.costOfEquity')} = <b style={{ color: 'var(--gold)' }}>{ke}%</b></span>
              <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '10px' }} onClick={() => setWacc(ke)}>{t('valuationPage.useAsWacc')}</button>
            </div>
            {meta?.wacc != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>{t('valuationPage.autoWacc')} = <b style={{ color: 'var(--gold)' }}>{meta.wacc}%</b><br /><span style={{ fontSize: '9px' }}>{t('valuationPage.autoWaccNote', { ke: meta.costEquity })}</span></span>
                <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '10px' }} onClick={() => setWacc(meta.wacc)}>{t('valuationPage.apply')}</button>
              </div>
            )}
          </div>
        </div>

        {/* RESULTADOS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={cardBase}>
            <div style={cap}>{t('valuationPage.intrinsicValueDcf')}</div>
            {dcf.error ? <div style={{ color: 'var(--red)', fontSize: '12px' }}>{dcf.error}</div> : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'baseline' }}>
                  <div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '32px', fontWeight: 700, color: upColor }}>{fmtP(dcf.perShare)}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{t('valuationPage.intrinsicPerShare')}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '20px', color: 'var(--text)' }}>{fmtP(N(price))}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{t('valuationPage.currentPrice')}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '24px', fontWeight: 700, color: upColor }}>{dcf.upside == null ? '—' : `${dcf.upside >= 0 ? '+' : ''}${dcf.upside.toFixed(1)}%`}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{t('valuationPage.upside')}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '10px' }}>
                  <span style={{ display: 'inline-block', fontFamily: "'DM Mono',monospace", fontSize: '11px', padding: '4px 10px', borderRadius: '10px', background: upColor + '22', color: upColor }}>{verdict}</span>
                  {mos != null && <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: 'var(--muted)' }}>{t('valuationPage.marginOfSafety')}: <b style={{ color: mos >= 0 ? 'var(--green)' : 'var(--red)' }}>{mos >= 0 ? '+' : ''}{mos.toFixed(0)}%</b></span>}
                </div>

                {/* Barra visual precio vs valor intrínseco */}
                {priceFrac != null && (
                  <div style={{ marginTop: '14px' }}>
                    <div style={{ position: 'relative', height: '12px', background: 'var(--surface2)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <div style={{ width: Math.min(100, priceFrac) + '%', height: '100%', background: upColor, transition: 'width .3s' }} />
                      <div style={{ position: 'absolute', top: '-2px', bottom: '-2px', left: '100%', width: '2px', background: 'var(--gold)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--muted)' }}>
                      <span>{t('valuationPage.priceLabel')} {fmtP(N(price))}</span>
                      <span style={{ color: 'var(--gold)' }}>{t('valuationPage.intrinsicValueLabel')} {fmtP(dcf.perShare)}</span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))', gap: '8px', marginTop: '16px' }}>
                  {[[t('valuationPage.ev'), fmtB(dcf.ev)], [t('valuationPage.minusNetDebt'), fmtB(N(netDebt))], [t('valuationPage.equalsEquity'), fmtB(dcf.equity)]].map(([l, v]) => (
                    <div key={l} style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '8px 10px' }}>
                      <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{l}</div>
                      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: 600 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ROIC vs WACC */}
          <div style={cardBase}>
            <div style={cap}>{t('valuationPage.qualityRoicWacc')}</div>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '120px' }}><Field label="ROIC" value={roic} onChange={setRoic} suffix="%" /></div>
              <div style={{ flex: 1, minWidth: '120px', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>{t('valuationPage.spread')}</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '22px', fontWeight: 700, color: spread >= 0 ? 'var(--green)' : 'var(--red)' }}>{spread >= 0 ? '+' : ''}{spread} pp</div>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6 }}>
              {spread >= 0 ? t('valuationPage.createsValueNote') : t('valuationPage.destroysValueNote')}
            </div>
          </div>

          {/* Proyección */}
          {!dcf.error && (
            <div style={{ ...cardBase, overflowX: 'auto' }}>
              <div style={cap}>{t('valuationPage.projectionTitle')}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'DM Mono',monospace" }}>
                <thead><tr style={{ color: 'var(--muted)', fontSize: '10px', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>{t('valuationPage.colYear')}</th><th style={{ padding: '4px 6px' }}>{t('valuationPage.colProjectedFcf')}</th><th style={{ padding: '4px 6px' }}>{t('valuationPage.colPresentValue')}</th>
                </tr></thead>
                <tbody>
                  {dcf.rows.map(r => (
                    <tr key={r.y} style={{ fontSize: '12px', borderTop: '1px solid var(--border)' }}>
                      <td style={{ textAlign: 'left', padding: '6px', color: 'var(--gold)' }}>{r.y}</td>
                      <td style={{ textAlign: 'right', padding: '6px' }}>{fmtB(r.fcf)}</td>
                      <td style={{ textAlign: 'right', padding: '6px', color: 'var(--text)' }}>{fmtB(r.pv)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontSize: '12px', borderTop: '1px solid var(--border)' }}>
                    <td style={{ textAlign: 'left', padding: '6px', color: 'var(--gold)' }}>{t('valuationPage.terminalValueAbbr')} <span style={{ color: 'var(--muted)', fontSize: '9px' }}>{t('valuationPage.perpetuity')}</span></td>
                    <td style={{ textAlign: 'right', padding: '6px' }}>{fmtB(dcf.tv)}</td>
                    <td style={{ textAlign: 'right', padding: '6px', color: 'var(--text)' }}>{fmtB(dcf.pvTv)}</td>
                  </tr>
                </tbody>
              </table>
              {dcf.tvWeight != null && (
                <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>
                  {t('valuationPage.tvWeightPrefix')} <b style={{ color: dcf.tvWeight > 80 ? '#e67e22' : 'var(--text)' }}>{dcf.tvWeight.toFixed(0)}%</b> {t('valuationPage.tvWeightOfEv')}{dcf.tvWeight > 80 ? t('valuationPage.tvWeightHigh') : t('valuationPage.tvWeightNormal')}
                </div>
              )}
            </div>
          )}

          {/* Matriz de sensibilidad WACC × g terminal */}
          {sensitivity && (
            <div style={{ ...cardBase, overflowX: 'auto' }}>
              <div style={cap}>{t('valuationPage.sensitivityMatrix.title')}</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '10px', lineHeight: 1.6 }}>{t('valuationPage.sensitivityMatrix.note')}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'DM Mono',monospace", fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--muted)', fontSize: '9px' }}>{t('valuationPage.sensitivityMatrix.waccLabel')} \ {t('valuationPage.sensitivityMatrix.gLabel')}</th>
                    {sensitivity.gtSteps.map((gt, ci) => (
                      <th key={gt} style={{ padding: '4px 6px', textAlign: 'right', color: ci === CURRENT_COL ? 'var(--gold)' : 'var(--muted)', fontSize: '10px' }}>{gt.toFixed(1)}%</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sensitivity.grid.map((row, ri) => (
                    <tr key={sensitivity.waccSteps[ri]} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 6px', color: ri === CURRENT_ROW ? 'var(--gold)' : 'var(--muted)', fontSize: '10px' }}>{sensitivity.waccSteps[ri].toFixed(1)}%</td>
                      {row.map((v, ci) => {
                        const isCurrent = ri === CURRENT_ROW && ci === CURRENT_COL;
                        return (
                          <td key={ci} style={{
                            padding: '4px 6px', textAlign: 'right',
                            background: isCurrent ? 'rgba(212,175,55,.15)' : 'transparent',
                            border: isCurrent ? '1px solid var(--gold)' : 'none',
                            color: v == null ? 'var(--muted)' : (v / N(price) - 1) >= 0 ? 'var(--green)' : 'var(--red)',
                          }}>{v == null ? '—' : fmtP(v)}</td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7 }}>
        {t('valuationPage.footerPrefix')} <b>{t('valuationPage.marginOfSafety')}</b>. {t('valuationPage.footerSuffix')}
      </div>
    </div>
  );
}
