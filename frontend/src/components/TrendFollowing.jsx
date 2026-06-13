import React, { useEffect, useState, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const RANGES = [['6mo', '6M'], ['1y', '1A'], ['2y', '2A']];
const fmtDay = (ts) => { const d = new Date(ts); return `${d.getDate()} ${MESES[d.getMonth()]}`; };

const SIG = {
  long: { label: 'ALCISTA', color: '#2ecc71', bg: 'rgba(46,204,113,.14)', arrow: '▲' },
  short: { label: 'BAJISTA', color: '#e74c3c', bg: 'rgba(231,76,60,.14)', arrow: '▼' },
  flat: { label: 'LATERAL', color: '#7a8694', bg: 'rgba(122,134,148,.14)', arrow: '▬' },
};
const sigOf = (s) => SIG[s] || SIG.flat;
const CLASS_ORDER = ['Índices', 'Bonos', 'Materias primas', 'Divisas', 'Cripto', 'Volatilidad'];

const cardBase = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' };
const cap = { fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' };

export default function TrendFollowing({ theme, toast }) {
  const isDark = theme === 'dark';
  const [tab, setTab] = useState('ticker');

  // ── Tab Ticker ──
  const [symbol, setSymbol] = useState('AAPL');
  const [input, setInput] = useState('AAPL');
  const [range, setRange] = useState('1y');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (sym, rg) => {
    setLoading(true);
    try {
      const d = await api.trendfollow(sym, rg);
      setData(d);
    } catch (e) {
      toast?.('⚠ ' + (e.message || 'No se pudo cargar ' + sym));
      setData(null);
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { if (tab === 'ticker') load(symbol, range); }, [symbol, range, tab, load]);

  const analyze = () => { const s = input.trim().toUpperCase(); if (s) setSymbol(s); };

  // ── Tab Universo ──
  const [uni, setUni] = useState(null);
  const [uniRange, setUniRange] = useState('1y');
  const [uniLoading, setUniLoading] = useState(false);

  const loadUni = useCallback(async (rg) => {
    setUniLoading(true);
    try {
      const d = await api.trendUniverse(rg);
      setUni(d);
    } catch (e) {
      toast?.('⚠ ' + (e.message || 'No se pudo cargar el universo'));
      setUni(null);
    } finally { setUniLoading(false); }
  }, [toast]);

  useEffect(() => { if (tab === 'universe') loadUni(uniRange); }, [tab, uniRange, loadUni]);

  const openInTicker = (sym) => { setInput(sym); setSymbol(sym); setTab('ticker'); };

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';

  // ── Chart precio + medias + canal Donchian ──
  const chartData = data ? {
    labels: data.series.labels.map(fmtDay),
    datasets: [
      { label: 'Donchian ↑', data: data.series.donHigh, borderColor: 'rgba(201,168,76,.45)', borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false, tension: 0 },
      { label: 'Donchian ↓', data: data.series.donLow, borderColor: 'rgba(201,168,76,.45)', borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: '-1', backgroundColor: 'rgba(201,168,76,.05)', tension: 0 },
      { label: 'Precio', data: data.series.close, borderColor: '#3a8eff', backgroundColor: 'rgba(58,142,255,.06)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15, fill: false },
      { label: 'SMA 50', data: data.series.sma50, borderColor: '#2ecc71', borderWidth: 1.6, pointRadius: 0, tension: 0.15, fill: false, spanGaps: true },
      { label: 'SMA 200', data: data.series.sma200, borderColor: '#e67e22', borderWidth: 1.6, pointRadius: 0, tension: 0.15, fill: false, spanGaps: true },
    ],
  } : null;
  const chartOpts = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { color: textColor, font: { family: 'DM Mono', size: 10 }, boxWidth: 10, padding: 10, filter: (it) => ['Precio', 'SMA 50', 'SMA 200'].includes(it.text) } },
      tooltip: { backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1, callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y != null ? '$' + c.parsed.y : '—'}` } },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, maxTicksLimit: 12, autoSkip: true } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 10 }, callback: v => '$' + v } },
    },
  };

  const stat = (label, value, sub, color) => (
    <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '12px 14px' }}>
      <div style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '18px', fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{sub}</div>}
    </div>
  );

  // Lectura institucional
  const reading = (() => {
    if (!data) return '';
    const s = sigOf(data.signal);
    const cur = data.currency === 'USD' ? '$' : '';
    if (data.signal === 'flat')
      return `🟡 Sin tendencia clara: precio enredado con las medias (whipsaw). Un CTA se mantiene FUERA — el coste de operar lateral supera al beneficio.`;
    const conf = data.breakoutConfirms ? `con breakout Donchian de ${20}d confirmando` : `pero aún sin breakout Donchian (señal no confirmada)`;
    const tipo = data.signal === 'long' ? 'alcista — precio sobre SMA50>SMA200' : 'bajista — precio bajo SMA50<SMA200';
    return `${data.signal === 'long' ? '🟢' : '🔴'} Tendencia ${tipo}, ${conf}. Stop ATR (2×) en ${cur}${data.stop} (${data.stopPct > 0 ? '+' : ''}${data.stopPct}%). Sizing vol-target sugerido: ${data.volTargetSize}% de la unidad de riesgo.`;
  })();

  const s = data ? sigOf(data.signal) : SIG.flat;

  // ── Render tab Universo ──
  const renderUniverse = () => {
    if (uniLoading) return <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", fontSize: '12px', padding: '40px' }}>⏳ Escaneando ~{18} mercados…</div>;
    if (!uni) return <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontSize: '12px', padding: '40px' }}>No se pudo cargar el universo. Reintenta.</div>;
    const byClass = CLASS_ORDER.map(cl => ({ cl, items: uni.markets.filter(m => m.class === cl).sort((a, b) => (b.strength || -1) - (a.strength || -1)) })).filter(g => g.items.length);
    return (
      <>
        {/* Resumen agregado */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,120px),1fr))', gap: '10px', marginBottom: '18px' }}>
          {stat('Alcistas', uni.summary.long, 'en tendencia ↑', 'var(--green)')}
          {stat('Bajistas', uni.summary.short, 'en tendencia ↓', 'var(--red)')}
          {stat('Laterales', uni.summary.flat, 'sin tendencia', '#7a8694')}
          {stat('Sesgo neto', `${uni.summary.long - uni.summary.short > 0 ? '+' : ''}${uni.summary.long - uni.summary.short}`, 'long − short', uni.summary.long >= uni.summary.short ? 'var(--green)' : 'var(--red)')}
        </div>
        {byClass.map(({ cl, items }) => (
          <div key={cl} style={{ ...cardBase, marginBottom: '14px' }}>
            <div style={cap}>{cl}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,220px),1fr))', gap: '8px' }}>
              {items.map(m => {
                const ms = sigOf(m.signal);
                const dead = !m.signal;
                return (
                  <div key={m.symbol} onClick={() => !dead && openInTicker(m.symbol)}
                    style={{ background: dead ? 'var(--surface2)' : ms.bg, border: `1px solid ${dead ? 'var(--border)' : ms.color + '55'}`, borderRadius: '9px', padding: '10px 12px', cursor: dead ? 'default' : 'pointer', opacity: dead ? 0.5 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: 700 }}>{m.label}</span>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '12px', fontWeight: 700, color: dead ? 'var(--muted)' : ms.color }}>{dead ? '—' : `${ms.arrow} ${ms.label}`}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)' }}>{m.symbol}{m.price != null ? ` · ${m.price}` : ''}{m.changePct != null ? ` (${m.changePct > 0 ? '+' : ''}${m.changePct}%)` : ''}</span>
                      {!dead && <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)' }}>fuerza {m.strength}</span>}
                    </div>
                    {!dead && (
                      <div style={{ marginTop: '6px', height: '4px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${m.strength}%`, height: '100%', background: ms.color }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {uni.summary.failed > 0 && <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", marginTop: '4px' }}>⚠ {uni.summary.failed} mercado(s) sin datos esta vez (Yahoo).</div>}
      </>
    );
  };

  return (
    <div className="section active">
      {/* Intro */}
      <div style={{ ...cardBase, borderLeft: '4px solid var(--gold)', marginBottom: '18px' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', marginBottom: '6px' }}>Trend Following / CTA — Seguimiento de tendencia</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>El opuesto al value: no pregunta <b>cuánto vale</b> un activo sino <b>qué hace el precio</b>. Régimen por cruce de medias <b>50/200</b>, disparador por <b>breakout Donchian</b> (estilo Turtle), stop por <b>ATR</b> y tamaño por <b>volatility targeting</b> (más volatilidad ⇒ menos exposición). «Si sube, compro; si baja, vendo; si me equivoco, salgo rápido».</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
        <button className={`filter-chip${tab === 'ticker' ? ' active' : ''}`} onClick={() => setTab('ticker')}>📈 Análisis de un activo</button>
        <button className={`filter-chip${tab === 'universe' ? ' active' : ''}`} onClick={() => setTab('universe')}>🌐 Universo multi-mercado</button>
      </div>

      {tab === 'ticker' && (
        <>
          {/* Controles */}
          <div style={{ ...cardBase, marginBottom: '18px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '160px' }}>
                <label style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>Símbolo</label>
                <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && analyze()} placeholder="AAPL, GC=F, TLT…" style={{ width: '100%', marginTop: '4px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '15px' }} />
              </div>
              <button className="btn btn-gold" onClick={analyze} disabled={loading}>{loading ? '⏳' : 'Analizar'}</button>
            </div>
            <div style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", marginBottom: '5px', letterSpacing: '1px' }}>RANGO</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{RANGES.map(([k, l]) => <button key={k} className={`filter-chip${range === k ? ' active' : ''}`} onClick={() => setRange(k)}>{l}</button>)}</div>
            </div>
          </div>

          {data && (
            <>
              {/* Badge señal + stats */}
              <div style={{ ...cardBase, marginBottom: '18px', borderLeft: `4px solid ${s.color}`, display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ background: s.bg, color: s.color, borderRadius: '10px', padding: '10px 16px', fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: '17px' }}>{s.arrow} {s.label}</div>
                  <div>
                    <div style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", letterSpacing: '1px' }}>FUERZA DE TENDENCIA</div>
                    <div style={{ width: '160px', height: '8px', background: 'var(--surface2)', borderRadius: '5px', overflow: 'hidden', marginTop: '4px' }}>
                      <div style={{ width: `${data.strength}%`, height: '100%', background: s.color }} />
                    </div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: s.color, marginTop: '3px' }}>{data.strength}/100</div>
                  </div>
                </div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: 'var(--muted)' }}>{data.symbol} · {data.range} · {data.currency}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,120px),1fr))', gap: '10px', marginBottom: '18px' }}>
                {stat('Precio', '$' + data.price, data.symbol, 'var(--text)')}
                {stat('SMA 50', data.sma50 != null ? '$' + data.sma50 : '—', 'media rápida', '#2ecc71')}
                {stat('SMA 200', data.sma200 != null ? '$' + data.sma200 : '—', 'media lenta', '#e67e22')}
                {stat('ATR', data.atr != null ? '$' + data.atr : '—', data.atrPct != null ? data.atrPct + '% / día' : '', '#9b59b6')}
                {stat('Stop (2·ATR)', data.stop != null ? '$' + data.stop : '—', data.stopPct != null ? (data.stopPct > 0 ? '+' : '') + data.stopPct + '%' : 'sin posición', data.stop != null ? '#e74c3c' : 'var(--muted)')}
                {stat('Vol. realizada', data.realizedVol != null ? data.realizedVol + '%' : '—', 'anualizada', '#3a8eff')}
                {stat('Sizing vol-target', data.volTargetSize != null ? data.volTargetSize + '%' : '—', 'objetivo ' + data.targetVol + '%', '#c9a84c')}
                {stat('Donchian 20d', data.donchianHigh != null ? `$${data.donchianLow}–$${data.donchianHigh}` : '—', data.breakout ? 'breakout ' + (data.breakout === 'up' ? '↑' : '↓') : 'dentro de canal', data.breakout === 'up' ? 'var(--green)' : data.breakout === 'down' ? 'var(--red)' : 'var(--muted)')}
              </div>

              {/* Lectura institucional */}
              <div style={{ ...cardBase, marginBottom: '18px', fontFamily: "'DM Mono',monospace", fontSize: '12.5px', lineHeight: 1.7 }}>{reading}</div>

              {/* Chart */}
              <div style={cardBase}>
                <div style={cap}>Precio · SMA 50 / 200 · Canal Donchian (20d)</div>
                <div style={{ position: 'relative', height: '380px' }}>{!loading && chartData && <Line data={chartData} options={chartOpts} />}</div>
              </div>
            </>
          )}

          {loading && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", fontSize: '12px', padding: '40px' }}>⏳ Analizando {symbol}…</div>}
          {!loading && !data && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontSize: '12px', padding: '40px' }}>No se pudieron cargar datos para <b>{symbol}</b>. Prueba símbolos exactos de Yahoo (ej: AAPL, NVDA, GC=F, EURUSD=X, BTC-USD).</div>}
        </>
      )}

      {tab === 'universe' && (
        <>
          <div style={{ ...cardBase, marginBottom: '18px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6, maxWidth: '600px' }}>La tendencia es un fenómeno <b>universal</b>: este panel escanea clases de activo descorrelacionadas (índices, bonos, materias primas, divisas, cripto, volatilidad) para ver <b>dónde hay tendencia</b>. Pulsa un mercado para analizarlo en detalle.</div>
            <div>
              <div style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", marginBottom: '5px', letterSpacing: '1px' }}>RANGO</div>
              <div style={{ display: 'flex', gap: '6px' }}>{RANGES.map(([k, l]) => <button key={k} className={`filter-chip${uniRange === k ? ' active' : ''}`} onClick={() => setUniRange(k)}>{l}</button>)}</div>
            </div>
          </div>
          {renderUniverse()}
        </>
      )}

      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7 }}>
        📈 El seguimiento de tendencia asume muchas pérdidas pequeñas (lateral) para capturar pocas ganancias grandes (tendencia fuerte). El stop por ATR y el sizing por volatilidad mantienen el riesgo constante. Herramienta de análisis con datos diarios de Yahoo, no asesoramiento.
      </div>
    </div>
  );
}
