import React, { useState, useMemo, useEffect } from 'react';
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
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState(null); // {name, sector, roicData, fcfCAGR}

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
      if (d.sharesOutstanding) setShares(+(d.sharesOutstanding / 1e6).toFixed(0));
      if (d.netDebt != null) setNetDebt(+(d.netDebt / 1e6).toFixed(0));
      if (d.price != null) setPrice(d.price);
      if (d.beta != null) setBeta(d.beta);
      if (d.roic != null) setRoic(d.roic);
      if (d.fcfCAGR != null) setGrowth(Math.max(0, Math.min(15, d.fcfCAGR)));
      setMeta({ name: d.name, sector: d.sector, roic: d.roic, fcfCAGR: d.fcfCAGR, roe: d.roe });
      toast?.(`✓ Datos de ${sym} cargados`);
    } catch (e) {
      toast?.('⚠ ' + (e.message || 'No se pudo cargar'));
    } finally { setLoading(false); }
  };

  // ─── Cálculo DCF ────────────────────────────────────────────
  const dcf = useMemo(() => {
    const g = N(growth) / 100, gt = N(termGrowth) / 100, w = N(wacc) / 100, n = Math.max(1, Math.min(15, N(years, 5)));
    const f0 = N(fcf0), sh = N(shares), nd = N(netDebt), p = N(price);
    if (w <= gt) return { error: 'El WACC debe ser mayor que el crecimiento terminal.' };
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
    return { rows, pvSum, pvTv, ev, equity, perShare, upside, n };
  }, [fcf0, growth, years, termGrowth, wacc, shares, netDebt, price]);

  const spread = +(N(roic) - N(wacc)).toFixed(2);
  const cardBase = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' };
  const cap = { fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '14px' };

  const upColor = dcf.upside == null ? 'var(--muted)' : dcf.upside >= 0 ? 'var(--green)' : 'var(--red)';
  const verdict = dcf.upside == null ? '—'
    : dcf.upside >= 30 ? 'Infravalorada · margen amplio'
    : dcf.upside >= 0 ? 'Ligeramente infravalorada'
    : dcf.upside >= -20 ? 'Cerca del valor justo'
    : 'Sobrevalorada';
  // Margen de seguridad: cuánto por debajo del valor intrínseco cotiza el precio
  const mos = (dcf.perShare != null && dcf.perShare > 0 && N(price) > 0) ? (1 - N(price) / dcf.perShare) * 100 : null;
  const priceFrac = (dcf.perShare > 0 && N(price) > 0) ? Math.max(2, Math.min(140, (N(price) / dcf.perShare) * 100)) : null;

  return (
    <div className="section active">
      {/* Intro */}
      <div style={{ ...cardBase, borderLeft: '4px solid var(--gold)', marginBottom: '18px' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', marginBottom: '6px' }}>Valoración por Flujos Descontados (DCF) + ROIC vs WACC</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>Estima el <b>valor intrínseco</b> de una empresa descontando su flujo de caja libre futuro al coste de capital (WACC). Compara <b>ROIC vs WACC</b> para ver si crea o destruye valor. Introduce un ticker para autocompletar los fundamentales, o ajústalo todo a mano.</div>
      </div>

      {/* Ticker */}
      <div style={{ ...cardBase, marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>Ticker (autocompleta FCF, acciones, deuda, precio, beta, ROIC)</label>
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && fetchData()} placeholder="AAPL, MSFT, NVDA…" style={{ ...inputStyle, marginTop: '4px', fontSize: '15px' }} />
          </div>
          <button className="btn btn-gold" onClick={fetchData} disabled={loading || !ticker.trim()}>{loading ? '⏳ Cargando…' : 'Traer datos ↓'}</button>
        </div>
        {meta && (
          <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>
            {meta.name}{meta.sector ? ` · ${meta.sector}` : ''}{meta.roic != null ? ` · ROIC ${meta.roic}%` : ''}{meta.fcfCAGR != null ? ` · CAGR FCF ${meta.fcfCAGR}%` : ''}
          </div>
        )}
        <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--muted)' }}>⚠ Alpha Vantage gratis limita a 25 consultas/día. Si se agota, los datos se introducen a mano (la calculadora funciona igual).</div>
      </div>

      {/* Inputs + Resultados */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: '16px', alignItems: 'start' }}>
        {/* INPUTS */}
        <div style={cardBase}>
          <div style={cap}>Supuestos del modelo</div>
          <Field label="FCF base (último año)" value={fcf0} onChange={setFcf0} suffix="M$" hint="flujo caja libre" />
          <Field label="Crecimiento anual FCF" value={growth} onChange={setGrowth} suffix="%/año" />
          <Field label="Años de proyección" value={years} onChange={setYears} suffix="años" step="1" />
          <Field label="Crecimiento terminal (g)" value={termGrowth} onChange={setTermGrowth} suffix="%" hint="a perpetuidad" />
          <Field label="WACC (tasa de descuento)" value={wacc} onChange={setWacc} suffix="%" />
          <Field label="Acciones en circulación" value={shares} onChange={setShares} suffix="M" />
          <Field label="Deuda neta" value={netDebt} onChange={setNetDebt} suffix="M$" hint="deuda − caja" />
          <Field label="Precio actual" value={price} onChange={setPrice} suffix="$/acc" />

          {/* WACC helper */}
          <div style={{ marginTop: '6px', padding: '12px', background: 'var(--surface2)', borderRadius: '9px' }}>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', marginBottom: '10px', letterSpacing: '1px' }}>AYUDA WACC · CAPM</div>
            <Field label="Tipo libre de riesgo (10Y)" value={rf} onChange={setRf} suffix="%" />
            <Field label="Beta" value={beta} onChange={setBeta} suffix="β" />
            <Field label="Prima de riesgo (ERP)" value={erp} onChange={setErp} suffix="%" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>Coste de capital (ke) = <b style={{ color: 'var(--gold)' }}>{ke}%</b></span>
              <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '10px' }} onClick={() => setWacc(ke)}>Usar como WACC</button>
            </div>
          </div>
        </div>

        {/* RESULTADOS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={cardBase}>
            <div style={cap}>Valor intrínseco (DCF)</div>
            {dcf.error ? <div style={{ color: 'var(--red)', fontSize: '12px' }}>{dcf.error}</div> : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'baseline' }}>
                  <div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '32px', fontWeight: 700, color: upColor }}>{fmtP(dcf.perShare)}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>valor intrínseco / acción</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '20px', color: 'var(--text)' }}>{fmtP(N(price))}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>precio actual</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '24px', fontWeight: 700, color: upColor }}>{dcf.upside == null ? '—' : `${dcf.upside >= 0 ? '+' : ''}${dcf.upside.toFixed(1)}%`}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>potencial</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '10px' }}>
                  <span style={{ display: 'inline-block', fontFamily: "'DM Mono',monospace", fontSize: '11px', padding: '4px 10px', borderRadius: '10px', background: upColor + '22', color: upColor }}>{verdict}</span>
                  {mos != null && <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: 'var(--muted)' }}>Margen de seguridad: <b style={{ color: mos >= 0 ? 'var(--green)' : 'var(--red)' }}>{mos >= 0 ? '+' : ''}{mos.toFixed(0)}%</b></span>}
                </div>

                {/* Barra visual precio vs valor intrínseco */}
                {priceFrac != null && (
                  <div style={{ marginTop: '14px' }}>
                    <div style={{ position: 'relative', height: '12px', background: 'var(--surface2)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <div style={{ width: Math.min(100, priceFrac) + '%', height: '100%', background: upColor, transition: 'width .3s' }} />
                      <div style={{ position: 'absolute', top: '-2px', bottom: '-2px', left: '100%', width: '2px', background: 'var(--gold)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--muted)' }}>
                      <span>Precio {fmtP(N(price))}</span>
                      <span style={{ color: 'var(--gold)' }}>Valor intrínseco {fmtP(dcf.perShare)}</span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))', gap: '8px', marginTop: '16px' }}>
                  {[['Valor empresa (EV)', fmtB(dcf.ev)], ['− Deuda neta', fmtB(N(netDebt))], ['= Equity', fmtB(dcf.equity)]].map(([l, v]) => (
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
            <div style={cap}>Calidad · ROIC vs WACC</div>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '120px' }}><Field label="ROIC" value={roic} onChange={setRoic} suffix="%" /></div>
              <div style={{ flex: 1, minWidth: '120px', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>Spread (ROIC − WACC)</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '22px', fontWeight: 700, color: spread >= 0 ? 'var(--green)' : 'var(--red)' }}>{spread >= 0 ? '+' : ''}{spread} pp</div>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6 }}>
              {spread >= 0
                ? '✓ ROIC > WACC: la empresa CREA valor — cada euro invertido renta más que su coste de capital. Sello de calidad.'
                : '✗ ROIC < WACC: destruye valor — invierte por debajo de su coste de capital. Posible trampa de valor.'}
            </div>
          </div>

          {/* Proyección */}
          {!dcf.error && (
            <div style={{ ...cardBase, overflowX: 'auto' }}>
              <div style={cap}>Proyección de flujos</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'DM Mono',monospace" }}>
                <thead><tr style={{ color: 'var(--muted)', fontSize: '10px', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Año</th><th style={{ padding: '4px 6px' }}>FCF proyectado</th><th style={{ padding: '4px 6px' }}>Valor presente</th>
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
                    <td style={{ textAlign: 'left', padding: '6px', color: 'var(--muted)' }}>VT</td>
                    <td style={{ textAlign: 'right', padding: '6px', color: 'var(--muted)' }}>valor terminal</td>
                    <td style={{ textAlign: 'right', padding: '6px' }}>{fmtB(dcf.pvTv)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7 }}>
        🧮 El DCF es muy sensible a los supuestos (crecimiento y WACC): trátalo como un rango, no como un número exacto. Aplica siempre un <b>margen de seguridad</b>. Esto es una herramienta educativa, no asesoramiento de inversión.
      </div>
    </div>
  );
}
