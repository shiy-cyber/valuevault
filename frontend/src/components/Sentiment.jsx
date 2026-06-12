import React, { useEffect, useState, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Escala 0-100 → color y etiqueta de zona (miedo ↔ codicia)
const scoreColor = (v) => v == null ? 'var(--muted)' : v < 25 ? '#e74c3c' : v < 45 ? '#e67e22' : v < 55 ? '#c9a84c' : v < 75 ? '#2ecc71' : '#16a085';
const scoreZone  = (v) => v == null ? '—' : v < 25 ? 'Miedo extremo' : v < 45 ? 'Miedo' : v < 55 ? 'Neutral' : v < 75 ? 'Codicia' : 'Codicia extrema';
// Traducción de los ratings textuales que devuelve CNN
const RATING_ES = { 'extreme fear':'Miedo extremo', 'fear':'Miedo', 'neutral':'Neutral', 'greed':'Codicia', 'extreme greed':'Codicia extrema' };
const ratingEs = (r) => RATING_ES[String(r || '').toLowerCase()] || (r || '—');
const CLASS_ES = { 'Extreme Fear':'Miedo extremo', 'Fear':'Miedo', 'Neutral':'Neutral', 'Greed':'Codicia', 'Extreme Greed':'Codicia extrema' };

const fmtDay = (ts) => { const d = new Date(ts); return `${d.getDate()} ${MESES[d.getMonth()]}`; };

// ─── Medidor semicircular tipo aguja (0-100) ────────────────
function Gauge({ value }) {
  const v = value == null ? 50 : Math.max(0, Math.min(100, value));
  const cx = 150, cy = 150, r = 120;
  const polar = (deg, rad = r) => { const a = deg * Math.PI / 180; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]; };
  const arc = (a, b) => {
    const [x1, y1] = polar(180 + a / 100 * 180);
    const [x2, y2] = polar(180 + b / 100 * 180);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${(b - a) > 50 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const segs = [[0,25,'#e74c3c'],[25,45,'#e67e22'],[45,55,'#c9a84c'],[55,75,'#2ecc71'],[75,100,'#16a085']];
  const [ntx, nty] = polar(180 + v / 100 * 180, r - 32);
  const col = scoreColor(value);
  return (
    <svg viewBox="0 0 300 178" style={{ width:'100%', maxWidth:'330px' }}>
      {segs.map(([a,b,c],i) => <path key={i} d={arc(a,b)} fill="none" stroke={c} strokeWidth="20" />)}
      <line x1={cx} y1={cy} x2={ntx.toFixed(1)} y2={nty.toFixed(1)} stroke="var(--text)" strokeWidth="4" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="9" fill="var(--text)" />
      <text x={cx} y={cy - 30} textAnchor="middle" style={{ fontFamily:"'DM Mono',monospace", fontWeight:700, fontSize:'42px', fill: col }}>{value == null ? '—' : Math.round(value)}</text>
      <text x="30" y="170" textAnchor="middle" style={{ fontFamily:"'DM Mono',monospace", fontSize:'9px', fill:'var(--muted)' }}>0</text>
      <text x="270" y="170" textAnchor="middle" style={{ fontFamily:"'DM Mono',monospace", fontSize:'9px', fill:'var(--muted)' }}>100</text>
    </svg>
  );
}

// Mini-gráfica sin ejes para tarjetas (VIX / Crypto)
function Spark({ points, color, isDark }) {
  if (!points || points.length < 2) return null;
  const data = { labels: points.map((_, i) => i), datasets: [{ data: points, borderColor: color, backgroundColor: color + '22', borderWidth: 2, pointRadius: 0, tension: 0.35, fill: true }] };
  const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display:false }, tooltip: { enabled:false } }, scales: { x: { display:false }, y: { display:false } }, elements: { line: { borderJoinStyle:'round' } } };
  return <div style={{ height:'46px', marginTop:'8px' }}><Line data={data} options={opts} /></div>;
}

export default function Sentiment({ theme, toast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const isDark = theme === 'dark';

  const load = useCallback(async (fresh) => {
    if (fresh) setRefreshing(true);
    try {
      const d = await api.sentiment(fresh);
      setData(d);
      setUpdatedAt(new Date());
      const fails = Object.entries(d.errors || {}).filter(([, v]) => v).map(([k]) => k);
      if (fails.length) toast?.('⚠ Fuente no disponible: ' + fails.join(', '));
      else if (fresh) toast?.('↻ Sentimiento actualizado');
    } catch (e) {
      toast?.('⚠ No se pudo cargar el sentimiento: ' + e.message);
    } finally { setLoading(false); setRefreshing(false); }
  }, [toast]);

  useEffect(() => { load(false); }, [load]);

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';

  const cnn = data?.cnn, crypto = data?.crypto, vix = data?.vix;

  // VIX: zona interpretativa
  const vixZone = (x) => x == null ? '—' : x < 13 ? 'Complacencia' : x < 20 ? 'Calma' : x < 30 ? 'Cautela' : x < 40 ? 'Miedo' : 'Pánico';
  const vixColor = (x) => x == null ? 'var(--muted)' : x < 13 ? '#16a085' : x < 20 ? '#2ecc71' : x < 30 ? '#c9a84c' : x < 40 ? '#e67e22' : '#e74c3c';

  // Histórico CNN (línea principal)
  const hist = cnn?.history || [];
  const histData = {
    labels: hist.map(h => fmtDay(h.t)),
    datasets: [{ label: 'Fear & Greed', data: hist.map(h => h.score), borderColor: '#c9a84c', backgroundColor: 'rgba(201,168,76,.10)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, fill: true }],
  };
  const histOpts = {
    responsive: true, maintainAspectRatio: false, interaction: { mode:'index', intersect:false },
    plugins: {
      legend: { display:false },
      tooltip: { backgroundColor: isDark ? '#181c22' : '#fff', titleColor:textColor, bodyColor:textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth:1, callbacks: { label: c => `${Math.round(c.parsed.y)} · ${scoreZone(c.parsed.y)}` } },
    },
    scales: {
      x: { grid:{ color:gridColor }, ticks:{ color:textColor, font:{ family:'DM Mono', size:9 }, maxTicksLimit:12, autoSkip:true } },
      y: { min:0, max:100, grid:{ color:gridColor }, ticks:{ color:textColor, font:{ family:'DM Mono', size:9 }, stepSize:25 } },
    },
  };

  const prevRows = cnn ? [
    ['Cierre anterior', cnn.prev.close], ['Hace 1 semana', cnn.prev.week],
    ['Hace 1 mes', cnn.prev.month], ['Hace 1 año', cnn.prev.year],
  ] : [];

  const cardBase = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'18px' };
  const capTitle = { fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'14px' };

  return (
    <div className="section active">
      {/* Cabecera */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'16px', marginBottom:'3px' }}>Sentimiento de Mercado</div>
          <div style={{ fontSize:'11px', color:'var(--muted)', fontFamily:"'DM Mono',monospace" }}>
            Miedo y codicia · {loading ? 'cargando…' : 'CNN · alternative.me · Yahoo'}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {updatedAt && <span style={{ fontSize:'10px', color:'var(--muted)', fontFamily:"'DM Mono',monospace" }}>↻ {updatedAt.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}</span>}
          <button className="btn btn-outline" onClick={() => load(true)} disabled={refreshing || loading}>{refreshing ? '⏳ Actualizando…' : '↻ Actualizar'}</button>
        </div>
      </div>

      {/* Fila superior: GAUGE + VIX + CRYPTO */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(280px,1.4fr) repeat(2, minmax(180px,1fr))', gap:'14px', marginBottom:'18px' }}>
        {/* CNN Fear & Greed gauge */}
        <div style={{ ...cardBase, display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>
          <div style={{ ...capTitle, alignSelf:'flex-start' }}>Fear &amp; Greed Index · CNN</div>
          {cnn ? (
            <>
              <Gauge value={cnn.score} />
              <div style={{ fontFamily:"'Playfair Display',serif", fontWeight:700, fontSize:'20px', color: scoreColor(cnn.score), marginTop:'2px' }}>{scoreZone(cnn.score)}</div>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', marginTop:'2px' }}>según CNN: {ratingEs(cnn.rating)}</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginTop:'16px', width:'100%' }}>
                {prevRows.map(([l, val]) => (
                  <div key={l} style={{ background:'var(--surface2)', borderRadius:'8px', padding:'8px 10px', textAlign:'left' }}>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'9px', color:'var(--muted)' }}>{l}</div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'14px', fontWeight:700, color: scoreColor(val) }}>{val == null ? '—' : Math.round(val)} <span style={{ fontSize:'9px', fontWeight:400, color:'var(--muted)' }}>{scoreZone(val)}</span></div>
                  </div>
                ))}
              </div>
            </>
          ) : <div style={{ color:'var(--muted)', fontSize:'12px', padding:'30px 0' }}>{loading ? 'cargando…' : 'CNN no disponible ahora mismo'}</div>}
        </div>

        {/* VIX */}
        <div style={cardBase}>
          <div style={capTitle}>VIX · Volatilidad</div>
          {vix ? (
            <>
              <div style={{ display:'flex', alignItems:'baseline', gap:'8px' }}>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'30px', fontWeight:700, color: vixColor(vix.value) }}>{vix.value ?? '—'}</div>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'12px', color: vix.changePercent >= 0 ? 'var(--red)' : 'var(--green)' }}>{vix.changePercent >= 0 ? '+' : ''}{vix.changePercent}%</div>
              </div>
              <div style={{ display:'inline-block', marginTop:'6px', fontFamily:"'DM Mono',monospace", fontSize:'10px', padding:'2px 8px', borderRadius:'10px', background: vixColor(vix.value) + '22', color: vixColor(vix.value) }}>{vixZone(vix.value)}</div>
              <Spark points={(vix.history || []).map(h => h.close)} color={vixColor(vix.value)} isDark={isDark} />
              <div style={{ fontSize:'10px', color:'var(--muted)', lineHeight:1.6, marginTop:'8px' }}>Sube cuando hay miedo, baja en calma. &gt;30 = nerviosismo.</div>
            </>
          ) : <div style={{ color:'var(--muted)', fontSize:'12px' }}>{loading ? 'cargando…' : 'no disponible'}</div>}
        </div>

        {/* Crypto */}
        <div style={cardBase}>
          <div style={capTitle}>Crypto Fear &amp; Greed</div>
          {crypto ? (
            <>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'30px', fontWeight:700, color: scoreColor(crypto.value) }}>{crypto.value ?? '—'}</div>
              <div style={{ display:'inline-block', marginTop:'6px', fontFamily:"'DM Mono',monospace", fontSize:'10px', padding:'2px 8px', borderRadius:'10px', background: scoreColor(crypto.value) + '22', color: scoreColor(crypto.value) }}>{CLASS_ES[crypto.classification] || crypto.classification}</div>
              <Spark points={(crypto.history || []).map(h => h.value)} color={scoreColor(crypto.value)} isDark={isDark} />
              <div style={{ fontSize:'10px', color:'var(--muted)', lineHeight:1.6, marginTop:'8px' }}>Sentimiento del mercado cripto · últimos 30 días.</div>
            </>
          ) : <div style={{ color:'var(--muted)', fontSize:'12px' }}>{loading ? 'cargando…' : 'no disponible'}</div>}
        </div>
      </div>

      {/* Componentes del índice CNN */}
      {cnn && (
        <div style={{ ...cardBase, marginBottom:'18px' }}>
          <div style={capTitle}>Componentes del índice — qué mueve el sentimiento</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:'10px' }}>
            {cnn.components.map(c => (
              <div key={c.key} style={{ background:'var(--surface2)', borderRadius:'10px', padding:'12px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'11px', color:'var(--text)', fontWeight:600 }}>{c.label}</span>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'13px', fontWeight:700, color: scoreColor(c.score) }}>{c.score == null ? '—' : Math.round(c.score)}</span>
                </div>
                <div style={{ height:'6px', borderRadius:'4px', background:'var(--border)', overflow:'hidden', marginBottom:'6px' }}>
                  <div style={{ height:'100%', width:`${c.score ?? 0}%`, background: scoreColor(c.score), transition:'width .3s' }} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'6px' }}>
                  <span style={{ fontSize:'10px', color:'var(--muted)', lineHeight:1.4 }}>{c.desc}</span>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'9px', color: scoreColor(c.score), whiteSpace:'nowrap' }}>{ratingEs(c.rating)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico CNN */}
      {cnn && hist.length > 1 && (
        <div style={{ ...cardBase, marginBottom:'18px' }}>
          <div style={capTitle}>Evolución del Fear &amp; Greed — último año</div>
          <div style={{ position:'relative', height:'260px' }}>{!loading && <Line data={histData} options={histOpts} />}</div>
        </div>
      )}

      {/* Nota + fuentes */}
      <div style={{ padding:'12px 16px', background:'var(--surface2)', borderRadius:'8px', borderLeft:'3px solid var(--gold)', fontSize:'11px', color:'var(--muted)', lineHeight:1.7 }}>
        🧭 El sentimiento es un indicador <em>contrarian</em>: el miedo extremo suele coincidir con suelos de mercado y la codicia extrema con techos. Fuentes:
        <a href="https://edition.cnn.com/markets/fear-and-greed" target="_blank" rel="noreferrer" style={{ color:'var(--gold)', textDecoration:'none' }}> CNN Fear &amp; Greed</a> ·
        <a href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" rel="noreferrer" style={{ color:'var(--gold)', textDecoration:'none' }}> Crypto F&amp;G</a> ·
        <a href="https://www.cboe.com/tradable_products/vix/" target="_blank" rel="noreferrer" style={{ color:'var(--gold)', textDecoration:'none' }}> CBOE VIX</a>
      </div>
    </div>
  );
}
