import React, { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { CHART_COLORS } from '../lib/chartSetup.js';
import { riskLabel } from '../lib/format.js';

function donutData(labels, values, colors, isDark) {
  return {
    labels,
    datasets: [{
      data: values,
      backgroundColor: colors || CHART_COLORS.slice(0, values.length),
      borderColor: isDark ? '#111418' : '#ffffff',
      borderWidth: 2,
    }],
  };
}
function donutOpts(isDark) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'right', labels: { color: isDark ? '#7a8694' : '#6b7280', font: { family: 'DM Mono', size: 11 }, boxWidth: 12, padding: 10 } } },
  };
}

export default function Charts({ assets, theme }) {
  const isDark = theme === 'dark';

  const byStrategy = useMemo(() => {
    const sc = {};
    assets.forEach(a => a.strategies.forEach(s => { sc[s] = (sc[s] || 0) + 1; }));
    return donutData(Object.keys(sc).map(s => s.charAt(0).toUpperCase() + s.slice(1)), Object.values(sc), null, isDark);
  }, [assets, isDark]);

  const bySector = useMemo(() => {
    const sec = {};
    assets.forEach(a => { sec[a.sector || '—'] = (sec[a.sector || '—'] || 0) + 1; });
    return donutData(Object.keys(sec), Object.values(sec), null, isDark);
  }, [assets, isDark]);

  const byRisk = useMemo(() => {
    const rc = { Bajo: 0, Medio: 0, Alto: 0 };
    assets.forEach(a => { rc[riskLabel(a.risk)]++; });
    return donutData(Object.keys(rc), Object.values(rc), ['#2ecc71','#e67e22','#e74c3c'], isDark);
  }, [assets, isDark]);

  const byTime = useMemo(() => {
    const tc = { Corto: 0, Medio: 0, Largo: 0 };
    assets.forEach(a => a.time.forEach(t => { if (t === 'short') tc.Corto++; else if (t === 'medium') tc.Medio++; else tc.Largo++; }));
    return donutData(Object.keys(tc), Object.values(tc), null, isDark);
  }, [assets, isDark]);

  const opts = donutOpts(isDark);

  return (
    <div className="section active">
      <div className="charts-grid">
        <div className="chart-card"><div className="chart-title">Por Estrategia</div><div className="chart-wrap"><Doughnut data={byStrategy} options={opts} /></div></div>
        <div className="chart-card"><div className="chart-title">Por Sector</div><div className="chart-wrap"><Doughnut data={bySector} options={opts} /></div></div>
        <div className="chart-card"><div className="chart-title">Por Riesgo</div><div className="chart-wrap"><Doughnut data={byRisk} options={opts} /></div></div>
        <div className="chart-card"><div className="chart-title">Por Horizonte</div><div className="chart-wrap"><Doughnut data={byTime} options={opts} /></div></div>
      </div>
    </div>
  );
}
