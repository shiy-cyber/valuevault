import React, { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { CHART_COLORS } from '../lib/chartSetup.js';
import { riskLabel, positionMetrics, fmtBase } from '../lib/format.js';

// Peso en € de cada activo (valor de la posición en divisa base). Si ninguna
// posición tiene tamaño definido, caemos a "1 por activo" (modo recuento) para
// que los gráficos no salgan vacíos. Devuelve { weights, byValue }.
function weightsOf(assets, fxRates) {
  const w = assets.map(a => {
    const m = positionMetrics(a, fxRates || {});
    return m.sized ? m.valueBase : 0;
  });
  const total = w.reduce((s, x) => s + x, 0);
  if (total > 0) return { weights: w, byValue: true };
  return { weights: assets.map(() => 1), byValue: false };
}

// Agrega pesos por clave simple (sector, riesgo). keyFn → string
function aggregate(assets, weights, keyFn) {
  const acc = {};
  assets.forEach((a, i) => { const k = keyFn(a) || '—'; acc[k] = (acc[k] || 0) + weights[i]; });
  return acc;
}

// Agrega por clave MÚLTIPLE (estrategia, horizonte): reparte el peso del activo
// entre sus etiquetas para que la suma siga siendo 100%.
function aggregateMulti(assets, weights, listFn, labelFn) {
  const acc = {};
  assets.forEach((a, i) => {
    const list = listFn(a) || [];
    if (!list.length) { acc['Sin clasificar'] = (acc['Sin clasificar'] || 0) + weights[i]; return; }
    const share = weights[i] / list.length;
    list.forEach(t => { const k = labelFn(t); acc[k] = (acc[k] || 0) + share; });
  });
  return acc;
}

export default function Charts({ assets, theme, fxRates }) {
  const isDark = theme === 'dark';
  const { weights, byValue } = useMemo(() => weightsOf(assets, fxRates), [assets, fxRates]);
  const total = useMemo(() => weights.reduce((s, x) => s + x, 0), [weights]);

  // Construye datos de donut con % en la leyenda y € + % en el tooltip
  const build = (acc, colors) => {
    const entries = Object.entries(acc).sort((a, b) => b[1] - a[1]);
    const sum = entries.reduce((s, [, v]) => s + v, 0) || 1;
    return {
      labels: entries.map(([k, v]) => `${k} · ${(v / sum * 100).toFixed(0)}%`),
      datasets: [{
        data: entries.map(([, v]) => v),
        backgroundColor: colors || CHART_COLORS.slice(0, entries.length),
        borderColor: isDark ? '#111418' : '#ffffff',
        borderWidth: 2,
      }],
    };
  };

  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { color: isDark ? '#7a8694' : '#6b7280', font: { family: 'DM Mono', size: 11 }, boxWidth: 12, padding: 9 } },
      tooltip: { callbacks: { label: (c) => {
        const sum = c.dataset.data.reduce((s, x) => s + x, 0) || 1;
        const pct = (c.parsed / sum * 100).toFixed(1) + '%';
        return byValue ? `${fmtBase(c.parsed)} · ${pct}` : `${c.parsed} activo(s) · ${pct}`;
      } } },
    },
  };

  const byAsset = useMemo(() => build(aggregate(assets, weights, a => a.ticker)), [assets, weights, isDark]);
  const bySector = useMemo(() => build(aggregate(assets, weights, a => a.sector)), [assets, weights, isDark]);
  const byStrategy = useMemo(() => build(aggregateMulti(assets, weights, a => a.strategies, s => s.charAt(0).toUpperCase() + s.slice(1))), [assets, weights, isDark]);
  const byRisk = useMemo(() => build(aggregate(assets, weights, a => riskLabel(a.risk)), ['#2ecc71', '#e67e22', '#e74c3c']), [assets, weights, isDark]);
  const byTime = useMemo(() => build(aggregateMulti(assets, weights, a => a.time, t => t === 'short' ? 'Corto' : t === 'medium' ? 'Medio' : 'Largo')), [assets, weights, isDark]);

  // Mayor concentración por activo (para la alerta)
  const topPct = useMemo(() => {
    if (!total) return 0;
    const max = Math.max(0, ...weights);
    return max / total * 100;
  }, [weights, total]);

  return (
    <div className="section active">
      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px', lineHeight: 1.6 }}>
        {byValue
          ? <>Ponderado por <b>valor real en € </b>({fmtBase(total)} en cartera). Los % reflejan el peso de cada bloque.</>
          : <>⚠ Mostrando por <b>nº de activos</b> (ninguna posición tiene tamaño definido). Añade «Nº acciones» a tus activos para ver la concentración real en €.</>}
        {byValue && topPct >= 25 && (
          <div style={{ marginTop: '8px', color: 'var(--orange)' }}>⚠ Tu mayor posición concentra el <b>{topPct.toFixed(0)}%</b> de la cartera. Revisa el riesgo de concentración.</div>
        )}
      </div>
      <div className="charts-grid">
        <div className="chart-card"><div className="chart-title">Concentración por Activo</div><div className="chart-wrap"><Doughnut data={byAsset} options={opts} /></div></div>
        <div className="chart-card"><div className="chart-title">Por Sector</div><div className="chart-wrap"><Doughnut data={bySector} options={opts} /></div></div>
        <div className="chart-card"><div className="chart-title">Por Estrategia</div><div className="chart-wrap"><Doughnut data={byStrategy} options={opts} /></div></div>
        <div className="chart-card"><div className="chart-title">Por Riesgo</div><div className="chart-wrap"><Doughnut data={byRisk} options={opts} /></div></div>
        <div className="chart-card"><div className="chart-title">Por Horizonte</div><div className="chart-wrap"><Doughnut data={byTime} options={opts} /></div></div>
      </div>
    </div>
  );
}
