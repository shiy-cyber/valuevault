import React, { useEffect, useState, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';

// Índices clave para el vistazo rápido de "cómo está el mercado hoy".
const IDX = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'Nasdaq' },
  { symbol: '^DJI', label: 'Dow Jones' },
];

const scoreColor = (v) => v == null ? '#7a8694' : v < 25 ? '#e74c3c' : v < 45 ? '#e67e22' : v < 55 ? '#c9a84c' : v < 75 ? '#2ecc71' : '#16a085';
const scoreZone = (v) => v == null ? '—' : v < 25 ? 'Miedo extremo' : v < 45 ? 'Miedo' : v < 55 ? 'Neutral' : v < 75 ? 'Codicia' : 'Codicia extrema';
const vixColor = (x) => x == null ? '#7a8694' : x < 13 ? '#16a085' : x < 20 ? '#2ecc71' : x < 30 ? '#c9a84c' : x < 40 ? '#e67e22' : '#e74c3c';
const vixZone = (x) => x == null ? '—' : x < 13 ? 'Complacencia' : x < 20 ? 'Calma' : x < 30 ? 'Cautela' : x < 40 ? 'Miedo' : 'Pánico';
const chgColor = (c) => c == null ? '#7a8694' : c >= 0 ? '#2ecc71' : '#e74c3c';

// Mini-gráfica sin ejes, mismo patrón que Macro.jsx / Sentiment.jsx.
function Spark({ points, color }) {
  if (!points || points.length < 2) return null;
  const data = { labels: points.map((_, i) => i), datasets: [{ data: points, borderColor: color, backgroundColor: color + '22', borderWidth: 1.5, pointRadius: 0, tension: 0.35, fill: true }] };
  const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } };
  return <div style={{ height: '30px', width: '100%' }}><Line data={data} options={opts} /></div>;
}

// Franja compacta al inicio del Dashboard con la situación general del
// mercado (índices USA + VIX + Fear & Greed, con sparkline de 1 mes cada
// uno). Se recarga en cada apertura del Dashboard (mount) contra endpoints
// ya cacheados en backend (10 min cotizaciones/histórico, snapshot del cron
// para sentimiento) — barata de pedir.
export default function MarketPulse() {
  const [quotes, setQuotes] = useState(null);
  const [hist, setHist] = useState({});
  const [fng, setFng] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const symbols = [...IDX.map(i => i.symbol), '^VIX'];
      const [q, s, ...hs] = await Promise.all([
        api.quotes(symbols),
        api.sentiment(false).catch(() => null),
        ...symbols.map(sym => api.history(sym, '1mo').catch(() => null)),
      ]);
      setQuotes(q);
      setFng(s?.cnn ?? null);
      const h = {};
      symbols.forEach((sym, i) => { h[sym] = hs[i]?.points?.map(p => p.close) ?? null; });
      setHist(h);
      setUpdatedAt(new Date());
    } catch {
      // silencioso: es un resumen informativo, no debe bloquear el resto del Dashboard
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const find = (sym) => quotes?.find(q => q.symbol === sym);
  const vix = find('^VIX');
  const fngSpark = (fng?.history || []).slice(-30).map(h => h.score);

  const pill = (key, label, value, color, sub, sparkPoints) => (
    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '10px 16px', minWidth: '120px', flex: '1 1 120px' }}>
      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '.5px', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '16px', fontWeight: 700, color }}>{value}</span>
      {sub && <span style={{ fontSize: '9px', color: 'var(--muted)' }}>{sub}</span>}
      <Spark points={sparkPoints} color={color} />
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid var(--gold)', borderRadius: '12px', marginBottom: '18px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '10px 16px', background: 'var(--surface2)', minWidth: '150px' }}>
        <span style={{ fontFamily: "'Playfair Display',serif", fontSize: '13px' }}>Pulso del Mercado</span>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--muted)', cursor: 'pointer' }} onClick={load}>
          {loading ? 'cargando…' : updatedAt ? `↻ ${updatedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : '↻ actualizar'}
        </span>
      </div>

      {!loading && quotes && (
        <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1 }}>
          {IDX.map(i => {
            const q = find(i.symbol);
            const chg = q?.changePercent;
            const color = chgColor(chg);
            return pill(i.symbol, i.label, chg == null ? '—' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`, color,
              q?.price ? q.price.toLocaleString('es-ES', { maximumFractionDigits: 0 }) : null, hist[i.symbol]);
          })}
          {pill('vix', 'VIX', vix?.price ?? '—', vixColor(vix?.price), vixZone(vix?.price), hist['^VIX'])}
          {fng && pill('fng', 'Fear & Greed', Math.round(fng.score), scoreColor(fng.score), scoreZone(fng.score), fngSpark)}
        </div>
      )}
      {loading && <div style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>Cargando situación del mercado…</div>}
    </div>
  );
}
