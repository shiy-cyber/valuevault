import React from 'react';
import { Line } from 'react-chartjs-2';

// Mini-gráfica sin ejes (sparkline). Antes copiada (con ligeras variaciones
// de tension/grosor) en MarketPulse, Macro y Sentiment. El contenedor con
// las dimensiones lo pone quien la usa — cada pantalla la encaja distinto —
// esta sola devuelve el <Line> configurado.
export default function SparkChart({ points, color, tension = 0.35, borderWidth = 2, roundJoins = false }) {
  if (!points || points.length < 2) return null;
  const data = { labels: points.map((_, i) => i), datasets: [{ data: points, borderColor: color, backgroundColor: color + '22', borderWidth, pointRadius: 0, tension, fill: true }] };
  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false } },
    ...(roundJoins ? { elements: { line: { borderJoinStyle: 'round' } } } : {}),
  };
  return <Line data={data} options={opts} />;
}
