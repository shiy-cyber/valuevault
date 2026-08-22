import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';
import StatCard from './shared/StatCard.jsx';

const RANGE_KEYS = ['6mo', '1y', '2y'];
// El backend devuelve el campo `class` en español (para filtrar); la
// etiqueta mostrada se resuelve via i18next: trendFollowPage.classes.<key>
const CLASS_ORDER = [['Índices', 'indices'], ['Bonos', 'bonds'], ['Materias primas', 'commodities'], ['Divisas', 'currencies'], ['Cripto', 'crypto'], ['Volatilidad', 'volatility']];

const cardBase = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' };
const cap = { fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' };

export default function TrendFollowing({ theme, toast }) {
  const { t } = useTranslation();
  const months = t('macroPage.months', { returnObjects: true });
  const fmtDay = (ts) => { const d = new Date(ts); return `${d.getDate()} ${months[d.getMonth()]}`; };
  const RANGES = RANGE_KEYS.map(k => [k, t('volProfilePage.ranges.' + k)]);
  const SIG = {
    long: { label: t('trendFollowPage.bullish'), color: '#2ecc71', bg: 'rgba(46,204,113,.14)', arrow: '▲' },
    short: { label: t('trendFollowPage.bearish'), color: '#e74c3c', bg: 'rgba(231,76,60,.14)', arrow: '▼' },
    flat: { label: t('trendFollowPage.sideways'), color: '#7a8694', bg: 'rgba(122,134,148,.14)', arrow: '▬' },
  };
  const sigOf = (s) => SIG[s] || SIG.flat;
  const isDark = theme === 'dark';
  const [tab, setTab] = useState('ticker');

  // ── Tab Ticker ──
  const [symbol, setSymbol] = useState('AAPL');
  const [input, setInput] = useState('AAPL');
  const [range, setRange] = useState('1y');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [targetVol, setTargetVol] = useState(15); // objetivo de volatilidad editable (%)

  const load = useCallback(async (sym, rg) => {
    setLoading(true);
    try {
      const d = await api.trendfollow(sym, rg);
      setData(d);
    } catch (e) {
      toast?.(t('toast.error', { message: e.message || t('volProfilePage.couldNotLoadSym', { sym }) }));
      setData(null);
    } finally { setLoading(false); }
  }, [toast, t]);

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
      toast?.(t('toast.error', { message: e.message || t('trendFollowPage.couldNotLoadUniverse') }));
      setUni(null);
    } finally { setUniLoading(false); }
  }, [toast, t]);

  useEffect(() => { if (tab === 'universe') loadUni(uniRange); }, [tab, uniRange, loadUni]);

  const openInTicker = (sym) => { setInput(sym); setSymbol(sym); setTab('ticker'); };

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';

  // ── Chart precio + medias + canal Donchian ──
  const priceLabel = t('volProfilePage.priceLabel');
  const chartData = data ? {
    labels: data.series.labels.map(fmtDay),
    datasets: [
      { label: 'Donchian ↑', data: data.series.donHigh, borderColor: 'rgba(122,134,148,.4)', borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false, tension: 0 },
      { label: 'Donchian ↓', data: data.series.donLow, borderColor: 'rgba(122,134,148,.4)', borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: '-1', backgroundColor: 'rgba(122,134,148,.07)', tension: 0 },
      { label: priceLabel, data: data.series.close, borderColor: '#3a8eff', backgroundColor: 'rgba(58,142,255,.06)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15, fill: false },
      { label: 'SMA 50', data: data.series.sma50, borderColor: '#2ecc71', borderWidth: 2, pointRadius: 0, tension: 0.15, fill: false, spanGaps: true },
      { label: 'SMA 200', data: data.series.sma200, borderColor: '#e67e22', borderWidth: 2.4, pointRadius: 0, tension: 0.15, fill: false, spanGaps: true },
    ],
  } : null;
  const chartOpts = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { color: textColor, font: { family: 'DM Mono', size: 10 }, boxWidth: 10, padding: 10, filter: (it) => [priceLabel, 'SMA 50', 'SMA 200'].includes(it.text) } },
      tooltip: { backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1, callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y != null ? '$' + c.parsed.y : '—'}` } },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, maxTicksLimit: 12, autoSkip: true } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 10 }, callback: v => '$' + v } },
    },
  };

  const stat = (label, value, sub, color) => <StatCard label={label} value={value} sub={sub} color={color} size={18} />;

  // Lectura institucional
  const reading = (() => {
    if (!data) return '';
    if (data.signal === 'flat') return t('trendFollowPage.readingFlat');
    const cur = data.currency === 'USD' ? '$' : '';
    const conf = data.breakoutConfirms ? t('trendFollowPage.breakoutConfirmed', { days: 20 }) : t('trendFollowPage.breakoutNotConfirmed');
    const tipo = data.signal === 'long' ? t('trendFollowPage.trendUp') : t('trendFollowPage.trendDown');
    return t('trendFollowPage.readingTrend', {
      emoji: data.signal === 'long' ? '🟢' : '🔴', tipo, conf,
      cur, stop: data.stop, sign: data.stopPct > 0 ? '+' : '', stopPct: data.stopPct, sizing: data.volTargetSize,
    });
  })();

  const s = data ? sigOf(data.signal) : SIG.flat;
  // Sizing recalculado en vivo según el objetivo de volatilidad elegido
  const sizeNow = data && data.realizedVol ? Math.round(Math.max(0, Math.min(300, (targetVol / data.realizedVol) * 100))) : null;

  // ── Render tab Universo ──
  const renderUniverse = () => {
    if (uniLoading) return <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", fontSize: '12px', padding: '40px' }}>{t('trendFollowPage.scanning', { n: 18 })}</div>;
    if (!uni) return <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontSize: '12px', padding: '40px' }}>{t('trendFollowPage.couldNotLoadRetry')}</div>;
    const byClass = CLASS_ORDER.map(([cl, key]) => ({ cl, key, items: uni.markets.filter(m => m.class === cl).sort((a, b) => (b.strength || -1) - (a.strength || -1)) })).filter(g => g.items.length);
    return (
      <>
        {/* Resumen agregado */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,120px),1fr))', gap: '10px', marginBottom: '18px' }}>
          {stat(t('trendFollowPage.bullishCount'), uni.summary.long, t('trendFollowPage.inTrendUp'), 'var(--green)')}
          {stat(t('trendFollowPage.bearishCount'), uni.summary.short, t('trendFollowPage.inTrendDown'), 'var(--red)')}
          {stat(t('trendFollowPage.sidewaysCount'), uni.summary.flat, t('trendFollowPage.noTrend'), '#7a8694')}
          {stat(t('trendFollowPage.netBias'), `${uni.summary.long - uni.summary.short > 0 ? '+' : ''}${uni.summary.long - uni.summary.short}`, 'long − short', uni.summary.long >= uni.summary.short ? 'var(--green)' : 'var(--red)')}
        </div>
        {byClass.map(({ cl, key, items }) => (
          <div key={cl} style={{ ...cardBase, marginBottom: '14px' }}>
            <div style={cap}>{t('trendFollowPage.classes.' + key)}</div>
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
                      {!dead && <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)' }}>{t('trendFollowPage.strengthWord')} {m.strength}</span>}
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
        {uni.summary.failed > 0 && <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", marginTop: '4px' }}>{t('trendFollowPage.marketsNoData', { n: uni.summary.failed })}</div>}
      </>
    );
  };

  return (
    <div className="section active">
      {/* Intro */}
      <div style={{ ...cardBase, borderLeft: '4px solid var(--gold)', marginBottom: '18px' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', marginBottom: '6px' }}>{t('nav.trendfollow')} — {t('trendFollowPage.title')}</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>{t('trendFollowPage.subtitlePrefix')} <b>{t('trendFollowPage.howMuchBold')}</b> {t('trendFollowPage.subtitleMid')} <b>{t('trendFollowPage.whatPriceDoesBold')}</b>. {t('trendFollowPage.subtitle2')} <b>50/200</b>{t('trendFollowPage.subtitle3')} <b>{t('trendFollowPage.breakoutBold')}</b> {t('trendFollowPage.subtitle4')} <b>ATR</b> {t('trendFollowPage.subtitle5')} <b>{t('trendFollowPage.volTargetBold')}</b> {t('trendFollowPage.subtitle6')}</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
        <button className={`filter-chip${tab === 'ticker' ? ' active' : ''}`} onClick={() => setTab('ticker')}>{t('trendFollowPage.tabTicker')}</button>
        <button className={`filter-chip${tab === 'universe' ? ' active' : ''}`} onClick={() => setTab('universe')}>{t('trendFollowPage.tabUniverse')}</button>
      </div>

      {tab === 'ticker' && (
        <>
          {/* Controles */}
          <div style={{ ...cardBase, marginBottom: '18px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '160px' }}>
                <label style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>{t('trendFollowPage.symbol')}</label>
                <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && analyze()} placeholder="AAPL, GC=F, TLT…" style={{ width: '100%', marginTop: '4px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '15px' }} />
              </div>
              <button className="btn btn-gold" onClick={analyze} disabled={loading}>{loading ? '⏳' : t('volProfilePage.analyze')}</button>
            </div>
            <div style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", marginBottom: '5px', letterSpacing: '1px' }}>{t('volProfilePage.rangeLabel')}</div>
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
                    <div style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", letterSpacing: '1px' }}>{t('trendFollowPage.trendStrength')}</div>
                    <div style={{ width: '160px', height: '8px', background: 'var(--surface2)', borderRadius: '5px', overflow: 'hidden', marginTop: '4px' }}>
                      <div style={{ width: `${data.strength}%`, height: '100%', background: s.color }} />
                    </div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: s.color, marginTop: '3px' }}>{data.strength}/100</div>
                  </div>
                </div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: 'var(--muted)' }}>{data.symbol} · {data.range} · {data.currency}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,120px),1fr))', gap: '10px', marginBottom: '18px' }}>
                {stat(t('volProfilePage.priceLabel'), '$' + data.price, data.symbol, 'var(--text)')}
                {stat('SMA 50', data.sma50 != null ? '$' + data.sma50 : '—', t('trendFollowPage.fastMa'), '#2ecc71')}
                {stat('SMA 200', data.sma200 != null ? '$' + data.sma200 : '—', t('trendFollowPage.slowMa'), '#e67e22')}
                {stat('ATR', data.atr != null ? '$' + data.atr : '—', data.atrPct != null ? t('trendFollowPage.perDay', { pct: data.atrPct }) : '', '#9b59b6')}
                {stat(t('trendFollowPage.stop2atr'), data.stop != null ? '$' + data.stop : '—', data.stopPct != null ? (data.stopPct > 0 ? '+' : '') + data.stopPct + '%' : t('trendFollowPage.noPosition'), data.stop != null ? '#e74c3c' : 'var(--muted)')}
                {stat(t('trendFollowPage.realizedVol'), data.realizedVol != null ? data.realizedVol + '%' : '—', t('trendFollowPage.annualized'), '#3a8eff')}
                {stat(t('trendFollowPage.volTargetSizing'), sizeNow != null ? sizeNow + '%' : '—', t('trendFollowPage.targetPct', { pct: targetVol }), '#c9a84c')}
                {stat(t('trendFollowPage.donchian20d'), data.donchianHigh != null ? `$${data.donchianLow}–$${data.donchianHigh}` : '—', data.breakout ? t('trendFollowPage.breakoutDir', { dir: data.breakout === 'up' ? '↑' : '↓' }) : t('trendFollowPage.insideChannel'), data.breakout === 'up' ? 'var(--green)' : data.breakout === 'down' ? 'var(--red)' : 'var(--muted)')}
              </div>

              {/* Objetivo de volatilidad editable → recalcula el sizing en vivo */}
              <div style={{ ...cardBase, marginBottom: '18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px' }}>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>{t('trendFollowPage.volTargetLabel')}</div>
                <input type="range" min="5" max="30" step="1" value={targetVol} onChange={e => setTargetVol(+e.target.value)} style={{ flex: 1, minWidth: '150px', accentColor: 'var(--gold)' }} />
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '16px', fontWeight: 700, color: 'var(--gold)', minWidth: '46px', textAlign: 'right' }}>{targetVol}%</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: 'var(--muted)' }}>{t('trendFollowPage.arrowSizing')} <b style={{ color: 'var(--text)' }}>{sizeNow != null ? sizeNow + '%' : '—'}</b> <span style={{ opacity: .7 }}>({targetVol > 15 ? t('trendFollowPage.moreAggressive') : targetVol < 15 ? t('trendFollowPage.moreConservative') : t('trendFollowPage.standard')})</span></div>
              </div>

              {/* Lectura institucional */}
              <div style={{ ...cardBase, marginBottom: '18px', fontFamily: "'DM Mono',monospace", fontSize: '12.5px', lineHeight: 1.7 }}>{reading}</div>

              {/* Chart */}
              <div style={cardBase}>
                <div style={cap}>{t('trendFollowPage.chartTitle')}</div>
                <div style={{ position: 'relative', height: '380px' }}>{!loading && chartData && <Line data={chartData} options={chartOpts} />}</div>
              </div>
            </>
          )}

          {loading && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", fontSize: '12px', padding: '40px' }}>{t('volProfilePage.analyzing', { symbol })}</div>}
          {!loading && !data && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontSize: '12px', padding: '40px' }}>{t('volProfilePage.noDataPrefix')} <b>{symbol}</b>. {t('trendFollowPage.noDataSuffix')}</div>}
        </>
      )}

      {tab === 'universe' && (
        <>
          <div style={{ ...cardBase, marginBottom: '18px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6, maxWidth: '600px' }}>{t('trendFollowPage.universePrefix')} <b>{t('trendFollowPage.universalBold')}</b> {t('trendFollowPage.universeMid')} <b>{t('trendFollowPage.whereTrendBold')}</b>. {t('trendFollowPage.universeSuffix')}</div>
            <div>
              <div style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", marginBottom: '5px', letterSpacing: '1px' }}>{t('volProfilePage.rangeLabel')}</div>
              <div style={{ display: 'flex', gap: '6px' }}>{RANGES.map(([k, l]) => <button key={k} className={`filter-chip${uniRange === k ? ' active' : ''}`} onClick={() => setUniRange(k)}>{l}</button>)}</div>
            </div>
          </div>
          {renderUniverse()}
        </>
      )}

      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7 }}>
        {t('trendFollowPage.footer')}
      </div>
    </div>
  );
}
