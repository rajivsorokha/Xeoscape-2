// assets/js/ui/inventory-movement-chart.js
// A small hand-rolled SVG combo chart (no charting library dependency,
// consistent with the rest of this app's plain-DOM approach): stock
// level over time as a line, units sold per day as bars, and the
// reorder threshold (minStock) as a dashed reference line. Two
// independent scales (stock vs. units sold) since they're different
// units -- this isn't a true dual-axis chart with labeled second axis,
// just two series sharing the plot area, distinguished by color and a
// legend.

import { el } from '../shared/utils.js';

const WIDTH = 720;
const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 32, left: 40 };

function scaleLinear(domainMax, rangeMax) {
  const max = domainMax > 0 ? domainMax : 1;
  return (v) => (v / max) * rangeMax;
}

function formatShortDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}

/**
 * @param {HTMLElement} container
 * @param {{ days: {date:string, unitsSold:number, unitsRestocked:number, stockLevel:number}[], minStock: number }} data
 */
export function renderInventoryMovementChart(container, { days, minStock }) {
  container.innerHTML = '';

  if (!days || days.length === 0) {
    container.appendChild(el('div', { class: 'table-empty' }, 'No stock movement recorded in this period yet.'));
    return;
  }

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const maxStock = Math.max(...days.map((d) => d.stockLevel), minStock, 1);
  const maxSold = Math.max(...days.map((d) => d.unitsSold), 1);

  const stockScale = scaleLinear(maxStock, plotH);
  const soldScale = scaleLinear(maxSold, plotH);

  const stepX = days.length > 1 ? plotW / (days.length - 1) : 0;
  const barW = Math.min(18, (plotW / days.length) * 0.5);

  // Stock level line (drawn as a path across all days).
  const linePoints = days.map((d, i) => {
    const x = PAD.left + (days.length > 1 ? i * stepX : plotW / 2);
    const y = PAD.top + (plotH - stockScale(d.stockLevel));
    return `${x},${y}`;
  });
  const linePath = `M ${linePoints.join(' L ')}`;

  // Units-sold bars, centered on each day's x position.
  const bars = days.map((d, i) => {
    const x = PAD.left + (days.length > 1 ? i * stepX : plotW / 2);
    const barH = soldScale(d.unitsSold);
    const y = PAD.top + (plotH - barH);
    return `<rect x="${x - barW / 2}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="var(--color-green)" opacity="0.55"><title>${d.date}: ${d.unitsSold} sold</title></rect>`;
  }).join('');

  const minStockY = PAD.top + (plotH - stockScale(minStock));

  // X-axis labels: show at most ~7, evenly spaced, to avoid overlap.
  const labelEvery = Math.max(1, Math.ceil(days.length / 7));
  const xLabels = days.map((d, i) => {
    if (i % labelEvery !== 0 && i !== days.length - 1) return '';
    const x = PAD.left + (days.length > 1 ? i * stepX : plotW / 2);
    return `<text x="${x}" y="${HEIGHT - 8}" font-size="10" fill="var(--color-text-muted)" text-anchor="middle">${formatShortDate(d.date)}</text>`;
  }).join('');

  const svg = `
    <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="var(--color-border)" />
      <line x1="${PAD.left}" y1="${PAD.top + plotH}" x2="${WIDTH - PAD.right}" y2="${PAD.top + plotH}" stroke="var(--color-border)" />
      <line x1="${PAD.left}" y1="${minStockY}" x2="${WIDTH - PAD.right}" y2="${minStockY}" stroke="var(--color-danger)" stroke-width="1.5" stroke-dasharray="4 3" />
      <text x="${WIDTH - PAD.right}" y="${minStockY - 4}" font-size="10" fill="var(--color-danger)" text-anchor="end">Reorder point (${minStock})</text>
      ${bars}
      <path d="${linePath}" fill="none" stroke="var(--color-blue)" stroke-width="2" />
      ${xLabels}
    </svg>
  `;

  const legend = el('div', { class: 'movement-chart-legend' }, [
    el('span', { class: 'movement-legend-item' }, [el('span', { class: 'movement-legend-swatch movement-legend-stock' }), ' Stock level']),
    el('span', { class: 'movement-legend-item' }, [el('span', { class: 'movement-legend-swatch movement-legend-sold' }), ' Units sold/day']),
    el('span', { class: 'movement-legend-item' }, [el('span', { class: 'movement-legend-swatch movement-legend-reorder' }), ' Reorder point'])
  ]);

  const chartWrap = el('div', { class: 'movement-chart-svg-wrap' });
  chartWrap.innerHTML = svg;

  container.appendChild(chartWrap);
  container.appendChild(legend);
}
