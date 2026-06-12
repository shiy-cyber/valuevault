import React, { useEffect, useState, useCallback } from 'react';
import { Bar } from 'react-chartjs-2';
import { api } from '../lib/api.js';

const bn = (v) => v == null ? '—' : (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + ' bn' : (v / 1e6).toFixed(0) + ' M');

export default function Gamma({ theme, toast }) {
  const [symbol, setSymbol] = useState('SPY');
  const [input, setInput] = useState('SPY');
  const [date, setDate] = useState(null);       // unix de la expiración elegida
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const isDark = theme === 'dark';

  const load = useCallback(async (sym, d) => {
    setLoading(true);
    try { setData(await api.gamma(sym, d)); }
    catch (e) { toast?.('⚠ ' + (e.message || 'No se pudo cargar ' + sym)); setData(null); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(symbol, date); }, [symbol, date, load]);
  const analyze = () => { const s = input.trim().toUpperCase(); if (s) { setDate(null); setSymbol(s); } };

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
  const cardBase = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' };
  const cap = { fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' };

  const posColor = '#2ecc71', negColor = '#e74c3c';
  const chartData = data ? {
    labels: data.strikes.map(s => s.strike),
    datasets: [{
      label: 'GEX neto',
      data: data.strikes.map(s => +(s.netGEX / 1e6).toFixed(1)), // en $M
      backgroundColor: data.strikes.map(s => (s.netGEX >= 0 ? posColor : negColor) + 'cc'),
      borderWidth: 0,
    }],
  } : null;
  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1,
        callbacks: {
          title: (it) => 'Strike ' + it[0].label,
          label: (c) => `GEX ${c.parsed.y >= 0 ? '+' : ''}${c.parsed.y} M$ /1%`,
          afterLabel: (c) => { const s = data.strikes[c.dataIndex]; return `OI call ${s.callOI} · put ${s.putOI}`; },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, maxTicksLimit: 16, autoSkip: true, callback(i) { return this.getLabelForValue(i); } } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, callback: v => v + 'M' } },
    },
  };

  const stat = (label, value, sub, color) => (
    <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '12px 14px' }}>
      <div style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '16px', fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{sub}</div>}
    </div>
  );

  const regimePos = data?.regime === 'positive';
  const flipVsSpot = data && data.gammaFlip != null ? (data.spot >= data.gammaFlip ? 'por encima' : 'por debajo') : null;

  return (
    <div className="section active">
      <div style={{ ...cardBase, borderLeft: '4px solid var(--gold)', marginBottom: '18px' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', marginBottom: '6px' }}>Exposición a Gamma · GEX <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--gold)', border: '1px solid rgba(201,168,76,.3)', padding: '1px 7px', borderRadius: '10px', verticalAlign: 'middle' }}>OPCIONES</span></div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>
          Gamma de los <b>dealers</b> a partir del open interest e IV de la cadena de opciones. <b>GEX &gt; 0</b> = dealers en gamma larga → tienden a <b>amortiguar</b> el movimiento (menor volatilidad). <b>GEX &lt; 0</b> = gamma corta → <b>amplifican</b> el movimiento. El <b>gamma flip</b> es el precio donde la gamma total cruza cero; por encima suele dominar la estabilidad, por debajo la inestabilidad. <b>Call/Put wall</b> = strikes de mayor gamma (resistencia/soporte).
        </div>
      </div>

      {/* Controles */}
      <div style={{ ...cardBase, marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '160px' }}>
            <label style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>Ticker (subyacente con opciones)</label>
            <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && analyze()} placeholder="SPY, QQQ, NVDA…" style={{ width: '100%', marginTop: '4px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '15px' }} />
          </div>
          <button className="btn btn-gold" onClick={analyze} disabled={loading}>{loading ? '⏳' : 'Analizar'}</button>
          {data && data.expirations?.length > 0 && (
            <div style={{ minWidth: '150px' }}>
              <label style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>Vencimiento</label>
              <select value={date ?? data.expirationDate} onChange={e => setDate(Number(e.target.value))} style={{ width: '100%', marginTop: '4px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '13px' }}>
                {data.expirations.map(e => <option key={e.date} value={e.date}>{e.label}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: '10px', marginBottom: '18px' }}>
            {stat('Precio', '$' + data.spot, `${data.symbol} · ${data.daysToExpiry}d a venc.`)}
            {stat('GEX Neto', (data.netGEX >= 0 ? '+' : '−') + '$' + bn(Math.abs(data.netGEX)), regimePos ? 'gamma larga (estabiliza)' : 'gamma corta (amplifica)', regimePos ? posColor : negColor)}
            {stat('Gamma Flip', data.gammaFlip != null ? '$' + data.gammaFlip : '—', flipVsSpot ? `precio ${flipVsSpot}` : 'sin cruce', 'var(--gold)')}
            {stat('Call Wall', data.callWall != null ? '$' + data.callWall : '—', 'resistencia', negColor)}
            {stat('Put Wall', data.putWall != null ? '$' + data.putWall : '—', 'soporte', posColor)}
            {stat('Put/Call OI', data.putCallOI != null ? String(data.putCallOI) : '—', 'ratio open interest')}
          </div>

          <div style={{ ...cardBase, marginBottom: '18px' }}>
            <div style={{ ...cap, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span>Perfil de gamma por strike · venc. {data.expiry}</span>
              <span style={{ textTransform: 'none', letterSpacing: 0 }}><span style={{ color: posColor }}>■</span> gamma + · <span style={{ color: negColor }}>■</span> gamma − · spot ${data.spot}</span>
            </div>
            <div style={{ position: 'relative', height: '360px' }}>{!loading && chartData && <Bar data={chartData} options={chartOpts} />}</div>
          </div>
        </>
      )}

      {loading && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", fontSize: '12px', padding: '40px' }}>⏳ Calculando gamma de {symbol}…</div>}
      {!loading && !data && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontSize: '12px', padding: '40px' }}>No hay cadena de opciones para <b>{symbol}</b>. Prueba con un subyacente líquido de EE. UU. (SPY, QQQ, AAPL, NVDA…).</div>}

      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7 }}>
        ⚡ Gamma Black-Scholes sobre OI e IV de Yahoo, convención de dealer largo de calls / corto de puts (SqueezeMetrics). GEX en $ por cada 1% de movimiento del subyacente. Es una estimación —el posicionamiento real de los dealers no es público— y solo cubre la cadena de un vencimiento. Herramienta de análisis, no asesoramiento.
      </div>
    </div>
  );
}
