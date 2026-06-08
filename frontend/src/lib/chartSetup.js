// Registro global de Chart.js (una sola vez)
import {
  Chart as ChartJS,
  ArcElement, LineElement, BarElement, PointElement,
  CategoryScale, LinearScale,
  Tooltip, Legend, Filler,
} from 'chart.js';
import { TreemapController, TreemapElement } from 'chartjs-chart-treemap';

ChartJS.register(
  ArcElement, LineElement, BarElement, PointElement,
  CategoryScale, LinearScale,
  Tooltip, Legend, Filler,
  TreemapController, TreemapElement
);

export const CHART_COLORS = ['#c9a84c','#2ecc71','#3a8eff','#9b59b6','#e67e22','#e74c3c','#1abc9c','#f39c12'];
