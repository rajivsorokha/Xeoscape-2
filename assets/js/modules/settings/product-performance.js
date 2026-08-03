// assets/js/modules/settings/product-performance.js
// "Product Performance" settings section: turns raw transaction
// history into the financial/statistical view a merchant actually
// needs to spot low-selling products and weak demand -- ABC (Pareto)
// classification by revenue, basket penetration, gross margin (when a
// Cost Price is set), a stock-velocity proxy, and a combined
// statistical + revenue-tier flag for likely slow movers.
//
// All the underlying math lives in core/report-generator.js
// (#productPerformance) -- this file only renders it.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import notification from '../../ui/notification.js';
import { renderInventoryMovementChart } from '../../ui/inventory-movement-chart.js';

const RANGES = [
  { id: 'today', label: 'Today' },
  { id: '2days', label: '2 Days' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' }
];

const ABC_HINT = {
  A: 'Top revenue tier (\u2248 top 80% of revenue)',
  B: 'Mid revenue tier (next \u2248 15%)',
  C: 'Bottom revenue tier (\u2248 last 5%) \u2014 review these first'
};

export async function mountProductPerformance(container) {
  container.appendChild(el('h3', {}, 'Product Performance'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'ABC (Pareto) revenue ranking, basket penetration, gross margin (when Cost Price is set), and a combined statistical flag for slow-moving / weak-demand products. Click "Movement" on any row for a chart combining stock level and daily sales, with a stockout projection.'
  ));

  let selectedRange = 'month';
  let sortKey = 'revenue';
  let sortDir = 'desc';
  let onlyFlagged = false;
  let currentData = null;

  const summaryBox = el('div', { class: 'report-summary-box' }, 'Loading...');
  const flaggedToggle = el('input', {
    type: 'checkbox',
    onChange: (e) => { onlyFlagged = e.target.checked; renderTable(); }
  });
  const tableWrap = el('div', { class: 'table-container' });
  const movementPanel = el('div', { class: 'movement-panel', style: 'display:none;' });

  const rangeButtons = RANGES.map(({ id, label }) => {
    const btn = el('button', {
      class: `btn btn-sm ${id === selectedRange ? 'btn-primary' : 'btn-secondary'}`,
      onClick: () => {
        selectedRange = id;
        rangeButtons.forEach((b) => { b.classList.remove('btn-primary'); b.classList.add('btn-secondary'); });
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        load();
      }
    }, label);
    return btn;
  });

  container.appendChild(el('div', { class: 'report-range-row' }, rangeButtons));
  container.appendChild(summaryBox);
  container.appendChild(el('div', { class: 'perf-filter-row' }, [
    el('label', { class: 'perf-flag-toggle' }, [flaggedToggle, ' Show only flagged slow movers'])
  ]));
  container.appendChild(tableWrap);
  container.appendChild(movementPanel);

  function setSort(key) {
    if (sortKey === key) {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      sortKey = key;
      sortDir = 'desc';
    }
    renderTable();
  }

  async function load() {
    summaryBox.textContent = 'Loading...';
    tableWrap.innerHTML = '';
    try {
      currentData = await apiClient.get(`/reports/product-performance?range=${selectedRange}`);
      renderSummary();
      renderTable();
    } catch (err) {
      notification.error(`Failed to load product performance: ${err.message}`);
      summaryBox.textContent = 'Could not load report.';
    }
  }

  function renderSummary() {
    const d = currentData;
    const flaggedCount = d.items.filter((i) => i.flaggedSlowMoving).length;
    summaryBox.innerHTML = '';
    summaryBox.appendChild(el('div', { class: 'report-summary-grid' }, [
      el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Revenue'), el('div', { class: 'report-summary-value' }, formatMoney(d.totalRevenue))]),
      el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Baskets'), el('div', { class: 'report-summary-value' }, String(d.totalBaskets))]),
      el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Avg. Basket'), el('div', { class: 'report-summary-value' }, formatMoney(d.averageBasketValue))]),
      el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Flagged Slow Movers'), el('div', { class: 'report-summary-value perf-flag-count' }, String(flaggedCount))])
    ]));
  }

  async function openMovementChart(row) {
    movementPanel.style.display = 'block';
    movementPanel.innerHTML = 'Loading movement...';
    try {
      const movement = await apiClient.get(`/reports/inventory-movement?productId=${row.productId}&range=${selectedRange}`);
      movementPanel.innerHTML = '';
      movementPanel.appendChild(el('div', { class: 'movement-panel-header' }, [
        el('h4', {}, `Inventory Movement \u2014 ${movement.productName}`),
        el('button', { class: 'btn btn-sm btn-secondary', onClick: () => { movementPanel.style.display = 'none'; movementPanel.innerHTML = ''; } }, 'Close')
      ]));
      if (movement.stockoutRisk) {
        movementPanel.appendChild(el('div', { class: 'movement-stockout-callout' },
          `\u26A0 At the recent pace of ${movement.avgDailySales}/day, current stock (${movement.currentStock}) may run out in about ${movement.projectedDaysToStockout} day(s).`
        ));
      } else if (movement.projectedDaysToStockout != null) {
        movementPanel.appendChild(el('div', { class: 'movement-ok-note' },
          `At the recent pace of ${movement.avgDailySales}/day, current stock (${movement.currentStock}) covers about ${movement.projectedDaysToStockout} day(s).`
        ));
      }
      const chartHost = el('div', {});
      movementPanel.appendChild(chartHost);
      renderInventoryMovementChart(chartHost, { days: movement.days, minStock: movement.minStock });
    } catch (err) {
      movementPanel.innerHTML = '';
      notification.error(`Failed to load inventory movement: ${err.message}`);
    }
  }

  function renderTable() {
    tableWrap.innerHTML = '';
    if (!currentData) return;

    let items = onlyFlagged ? currentData.items.filter((i) => i.flaggedSlowMoving) : currentData.items;
    items = [...items].sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      if (va === vb) return 0;
      const cmp = va > vb ? 1 : -1;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    if (items.length === 0) {
      tableWrap.appendChild(el('div', { class: 'table-empty' }, 'No products match this view.'));
      return;
    }

    function th(label, key) {
      const active = sortKey === key;
      return el('th', {
        class: `perf-sortable-th${active ? ' active' : ''}`,
        onClick: () => setSort(key)
      }, `${label}${active ? (sortDir === 'desc' ? ' \u25BC' : ' \u25B2') : ''}`);
    }

    const thead = el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'Product'),
        th('Units Sold', 'unitsSold'),
        th('Revenue', 'revenue'),
        th('Rev. Share', 'revenueSharePct'),
        el('th', {}, 'ABC'),
        th('Basket %', 'basketPenetrationPct'),
        el('th', {}, 'Margin'),
        el('th', {}, 'Stock Covers'),
        el('th', {}, 'Z-score'),
        el('th', {}, 'Flag'),
        el('th', {}, 'Movement')
      ])
    ]);

    const rows = items.map((r) => el('tr', { class: r.flaggedSlowMoving ? 'perf-row-flagged' : '' }, [
      el('td', {}, [el('div', {}, r.name), el('div', { class: 'perf-sku' }, r.sku || '')]),
      el('td', {}, String(r.unitsSold)),
      el('td', {}, formatMoney(r.revenue)),
      el('td', {}, `${r.revenueSharePct}%`),
      el('td', {}, [el('span', { class: `perf-abc-badge perf-abc-${r.abcClass}`, title: ABC_HINT[r.abcClass] }, r.abcClass)]),
      el('td', {}, `${r.basketPenetrationPct}%`),
      el('td', {}, r.marginPct != null ? `${r.marginPct}%` : '\u2014'),
      el('td', {}, r.daysOfStockAtCurrentPace != null ? `${r.daysOfStockAtCurrentPace}d` : '\u2014'),
      el('td', {}, String(r.salesZScore)),
      el('td', {}, r.flaggedSlowMoving ? el('span', { class: 'perf-flag-badge' }, '\u26A0 Slow mover') : ''),
      el('td', {}, [el('button', { class: 'btn btn-sm btn-secondary', onClick: () => openMovementChart(r) }, '\u{1F4C8} Movement')])
    ]));

    tableWrap.appendChild(el('table', { class: 'app-table perf-table' }, [thead, el('tbody', {}, rows)]));
  }

  await load();
}
