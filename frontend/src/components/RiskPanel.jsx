import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api.js';
import { portfolioWeights, portfolioVol, avgCorrelation, corrColor } from '../lib/format.js';

const volColor = (v) => v == null ? 'var(--muted)' : v >= 35 ? 'var(--red)' : v >= 20 ? 'var(--orange)' : 'var(--green)';
const ddColor = (d) => d == null ? 'var(--muted)' : d <= -40 ? 'var(--red)' : d <= -20 ? 'var(--orange)' : 'var(--green)';

function diversification(avg) {
  if (avg == null) return { label: '—', color: 'var(--muted)' };
  if (avg < 0.3) return { label: 'Buena', color: 'var(--green)' };
  if (avg < 0.6) return { label: 'Media', color: 'var(--orange)' };
  return { label: 'Pobre (activos se mueven juntos)', color: 'var(--red)' };
}

// Riesgo cuantitativo de la cartera: volatilidad anualizada, máximo drawdown
// y matriz de correlación. Datos reales de Yahoo (histórico 1 año).
export default function RiskPanel({ assets, fxRates }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const tickers = useMemo(() => assets.map(a => a.ticker), [assets]);
  const tickKey = tickers.join(',');

  useEffect(() => {
    if (!tickers.length) { setData(null); return; }
    let alive = true;
    setData(null); setErr(null);
    api.risk(tickers, '1y')
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [tickKey]);

  if (!assets.length) return null;

  // Alinea métricas y matriz con el orden de `assets` (por símbolo)
  const bySym = data ? Object.fromEntries(data.assets.map(a => [a.symbol, a])) : {};
  const vols = tickers.map(t => bySym[t]?.vol ?? null);
  const corr = data?.matrix?.corr || [];
  const { weights, byValue } = portfolioWeights(assets, fxRates);
  const pVol = data ? portfolioVol(weights, vols, corr) : null;
  const avgCorr = data ? avgCorrelation(corr) : null;
  const div = diversification(avgCorr);
  const syms = data?.matrix?.symbols || [];

  return (
    <div style={{ marginBottom: '22px' }}>
      <div className="section-header" style={{ marginBottom: '12px' }}>
        <div className="section-title">Riesgo de Cartera <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 400 }}>· medido (Yahoo, 1 año)</span></div>
      </div>

      {err ? <div style={{ color: 'var(--muted)', fontSize: '12px' }}>No se pudo calcular el riesgo: {err}</div>
        : !data ? <div style={{ color: 'var(--muted)', fontSize: '12px' }}>Calculando volatilidad y correlaciones…</div>
        : (
          <>
            <div className="kpi-grid" style={{ marginBottom: '16px' }}>
              <div className="kpi-card">
                <div className="kpi-label">Volatilidad Cartera</div>
                <div className="kpi-value" style={{ color: volColor(pVol) }}>{pVol == null ? '—' : pVol + '%'}</div>
                <div className="kpi-sub">anualizada{byValue ? ' · ponderada €' : ' · igual peso'}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Correlación Media</div>
                <div className="kpi-value" style={{ color: div.color }}>{avgCorr == null ? '—' : avgCorr}</div>
                <div className="kpi-sub">diversificación: <span style={{ color: div.color }}>{div.label}</span></div>
              </div>
            </div>

            <div className="mv-section-label">Por Activo</div>
            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: "'DM Mono',monospace" }}>
                <thead>
                  <tr style={{ color: 'var(--muted)', textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Activo</th>
                    <th style={{ padding: '6px 8px' }}>Volatilidad</th>
                    <th style={{ padding: '6px 8px' }}>Máx. Drawdown</th>
                    <th style={{ padding: '6px 8px' }}>Peso</th>
                  </tr>
                </thead>
                <tbody>
                  {tickers.map((t, i) => {
                    const m = bySym[t] || {};
                    return (
                      <tr key={t} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text)' }}>{t}</td>
                        <td style={{ textAlign: 'right', padding: '6px 8px', color: volColor(m.vol) }}>{m.vol == null ? '—' : m.vol + '%'}</td>
                        <td style={{ textAlign: 'right', padding: '6px 8px', color: ddColor(m.maxDD) }}>{m.maxDD == null ? '—' : m.maxDD + '%'}</td>
                        <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--muted)' }}>{(weights[i] * 100).toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {syms.length >= 2 && (
              <>
                <div className="mv-section-label">Matriz de Correlación</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: '11px', fontFamily: "'DM Mono',monospace" }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '4px 6px' }}></th>
                        {syms.map(s => <th key={s} style={{ padding: '4px 6px', color: 'var(--muted)' }}>{s}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {syms.map((s, i) => (
                        <tr key={s}>
                          <td style={{ padding: '4px 6px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{s}</td>
                          {syms.map((s2, j) => {
                            const c = corr[i]?.[j];
                            return (
                              <td key={s2} style={{ padding: '4px 6px', textAlign: 'center', background: corrColor(c), color: 'var(--text)', borderRadius: '3px', minWidth: '42px' }}>
                                {c == null ? '—' : c.toFixed(2)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '8px' }}>
                  1 = se mueven idéntico · 0 = independientes · negativo = se compensan. Correlaciones altas (rojo) = menos diversificación real.
                </div>
              </>
            )}
          </>
        )}
    </div>
  );
}
