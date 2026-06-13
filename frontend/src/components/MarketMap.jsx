import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Chart } from 'react-chartjs-2';
import { api } from '../lib/api.js';

// Color estilo Finviz: gris neutro → verde/rojo, saturando hasta ±3%
function colorFor(v) {
  const neutral = [60, 66, 75];
  const green = [38, 166, 91];
  const red = [224, 65, 58];
  const t = Math.min(Math.abs(v) / 3, 1);
  const target = v >= 0 ? green : red;
  const c = neutral.map((n, i) => Math.round(n + (target[i] - n) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// El stock subyacente de un nodo de nivel 'ticker' (su único hijo)
function nodeStock(ctx) {
  const d = ctx.raw && ctx.raw._data;
  const ch = d && d.children;
  return Array.isArray(ch) && ch.length ? ch[0] : null;
}

export default function MarketMap({ theme, toast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const isDark = theme === 'dark';
  const chartRef = useRef(null);
  const wrapRef = useRef(null);

  // Doble clic sobre un valor → abre su ficha (Finviz), como en el mapa real.
  // Se engancha a un contenedor estable y lee el chart FRESCO (se recrea al refrescar).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const openTicker = (e) => {
      const chart = chartRef.current;
      if (!chart || !chart.canvas) return;
      let els;
      try { els = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false); }
      catch { return; }
      for (const el of els) {
        const raw = chart.getDatasetMeta(0).data[el.index]?.$context?.raw;
        const stock = raw && raw._data && raw._data.children && raw._data.children[0];
        if (raw && raw.l === 1 && stock) {
          window.open(`https://finviz.com/quote.ashx?t=${encodeURIComponent(stock.ticker)}`, '_blank', 'noopener');
          return;
        }
      }
    };
    wrap.addEventListener('dblclick', openTicker);
    return () => wrap.removeEventListener('dblclick', openTicker);
  }, []);

  // fresh=true salta la caché de 15 min del backend
  const load = useCallback(async (fresh) => {
    if (fresh) setRefreshing(true);
    try {
      const d = await api.marketMap(fresh);
      setData(d);
      setUpdatedAt(new Date());
      if (d.some(x => x.live === false)) toast?.('⚠ Algunos valores usan datos de respaldo');
      else if (fresh) toast?.('↻ Mapa actualizado');
    } catch (e) {
      toast?.('⚠ No se pudo cargar el mapa: ' + e.message);
    } finally { setLoading(false); setRefreshing(false); }
  }, [toast]);

  useEffect(() => { load(false); }, [load]);

  const chartData = useMemo(() => {
    if (!data) return null;
    return {
      datasets: [{
        tree: data,
        key: 'cap',
        groups: ['sector', 'ticker'], // 2 niveles → cada acción es un nodo pintable (nivel 1)
        spacing: 1,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(10,12,15,0.9)' : 'rgba(255,255,255,0.9)',
        backgroundColor: (ctx) => {
          if (ctx.type !== 'data' || ctx.raw.l !== 1) return 'transparent';
          const s = nodeStock(ctx);
          return s ? colorFor(s.changePercent) : 'transparent';
        },
        captions: {
          display: true,
          align: 'left',
          color: (ctx) => (ctx.raw.l === 0 ? (isDark ? '#cdd0d6' : '#1a1d23') : '#ffffff'),
          font: (ctx) => (ctx.raw.l === 0
            ? { family: 'DM Mono', size: 10, weight: 'bold' }
            : { family: 'DM Mono', size: 11, weight: 'bold' }),
          padding: 3,
          formatter: (ctx) => (ctx.raw.l === 0 ? (ctx.raw.g || '').toUpperCase() : ''),
        },
        labels: {
          display: true,
          overflow: 'hidden',
          color: '#ffffff',
          font: [{ family: 'DM Mono', size: 13, weight: 'bold' }, { family: 'DM Mono', size: 10 }],
          formatter: (ctx) => {
            const s = nodeStock(ctx);
            if (!s) return '';
            return [s.ticker, `${s.changePercent >= 0 ? '+' : ''}${Number(s.changePercent).toFixed(2)}%`];
          },
        },
      }],
    };
  }, [data, isDark]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'point', intersect: true },
    onHover: (e, els) => { if (e.native && e.native.target) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        // Solo el nodo de la acción (nivel 1), no el rectángulo del sector que hay detrás
        filter: (item) => item.raw && item.raw.l === 1,
        backgroundColor: isDark ? '#181c22' : '#fff',
        titleColor: isDark ? '#e8e9ea' : '#1a1d23',
        bodyColor: isDark ? '#7a8694' : '#6b7280',
        borderColor: isDark ? '#2d3540' : '#e2e4e8',
        borderWidth: 1,
        callbacks: {
          title: (items) => {
            const ctx = items[0];
            const s = nodeStock(ctx);
            return s ? `${s.ticker} — ${s.name || ''}` : (ctx.raw.g || '');
          },
          label: (ctx) => {
            const s = nodeStock(ctx);
            if (!s) return '';
            return [
              `${s.changePercent >= 0 ? '+' : ''}${Number(s.changePercent).toFixed(2)}%`,
              s.price != null ? `$${s.price}` : '',
              `${s.sector} · ${s.cap}B$`,
            ].filter(Boolean);
          },
        },
      },
    },
  };

  const legend = [['-3%', '#e0413a'], ['-2%', '#b8453e'], ['-1%', '#7d4a4a'], ['0%', '#3c424b'], ['+1%', '#3a7a52'], ['+2%', '#2f9a5c'], ['+3%', '#26a65b']];

  return (
    <div className="section active">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', marginBottom: '3px' }}>Mapa de Mercado</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>
            Tamaño = capitalización · color = variación del día · {loading ? 'cargando…' : 'datos Yahoo Finance'}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {updatedAt && <span style={{ fontSize:'10px', color:'var(--muted)', fontFamily:"'DM Mono',monospace" }}>↻ {updatedAt.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}</span>}
          <button className="btn btn-outline" onClick={() => load(true)} disabled={refreshing || loading}>{refreshing ? '⏳ Actualizando…' : '↻ Actualizar'}</button>
          <a href="https://finviz.com/map.ashx" target="_blank" rel="noreferrer" className="insider-link" style={{ fontSize: '11px' }}>Finviz Map completo ↗</a>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}>
        <div ref={wrapRef} style={{ position: 'relative', height: '560px' }}>
          {loading
            ? <div style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center', paddingTop: '240px' }}>Cargando mapa de mercado…</div>
            : chartData && <Chart ref={chartRef} type="treemap" data={chartData} options={options} />}
        </div>

        {/* Leyenda de color */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', marginTop: '12px', flexWrap: 'wrap' }}>
          {legend.map(([label, color]) => (
            <div key={label} style={{ background: color, color: '#fff', fontFamily: "'DM Mono',monospace", fontSize: '11px', padding: '4px 14px', minWidth: '52px', textAlign: 'center' }}>{label}</div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '14px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7 }}>
        🗺 Cesta de ~44 grandes valores agrupados por sector. Cada rectángulo es proporcional a su capitalización y se colorea por la variación del día (verde sube, rojo baja). Pasa el ratón por un valor para ver el detalle y haz <strong>doble clic para abrir su ficha</strong>. Para el mapa completo del mercado, abre <a href="https://finviz.com/map.ashx" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none' }}>Finviz</a>.
      </div>
    </div>
  );
}
