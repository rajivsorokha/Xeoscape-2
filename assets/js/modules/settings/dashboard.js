// assets/js/modules/settings/dashboard.js
// Settings -> Dashboard: sales performance graphs and a plain-language
// analysis. Charts are drawn as inline SVG (no chart library, no
// internet needed), data comes from GET /api/reports/dashboard.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import notification from '../../ui/notification.js';

const RANGES = [
  { days: 7, label: 'Last 7 Days' },
  { days: 30, label: 'Last 30 Days' },
  { days: 90, label: 'Last 90 Days' }
];

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function compact(n) {
  const v = Math.abs(n);
  if (v >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function hourLabel(h) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

// Vertical bar chart. items: [{label, value}]. Returns an SVG string.
function barChartSvg(items, { color = 'var(--color-blue)', height = 220, labelEvery = 1, highlightMax = true } = {}) {
  const W = 640;
  const pad = { l: 46, r: 8, t: 10, b: 28 };
  const innerW = W - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(1, ...items.map((i) => i.value));
  const barW = innerW / items.length;
  const maxIndex = items.findIndex((i) => i.value === max);

  let svg = `<svg viewBox="0 0 ${W} ${height}" style="width:100%; height:auto; display:block;" role="img">`;
  for (let g = 0; g <= 4; g += 1) {
    const y = pad.t + innerH - (innerH * g) / 4;
    svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="var(--color-border)" stroke-width="1"/>`;
    svg += `<text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--color-text-muted)">${compact((max * g) / 4)}</text>`;
  }
  items.forEach((item, i) => {
    const h = (item.value / max) * innerH;
    const x = pad.l + i * barW + barW * 0.15;
    const w = barW * 0.7;
    const fill = highlightMax && i === maxIndex && item.value > 0 ? 'var(--color-green)' : color;
    svg += `<rect x="${x}" y="${pad.t + innerH - h}" width="${w}" height="${Math.max(h, item.value > 0 ? 1 : 0)}" rx="2" fill="${fill}"><title>${esc(item.label)}: ${esc(item.tip ?? item.value)}</title></rect>`;
    if (i % labelEvery === 0) {
      svg += `<text x="${x + w / 2}" y="${height - 8}" text-anchor="middle" font-size="11" fill="var(--color-text-muted)">${esc(item.label)}</text>`;
    }
  });
  return `${svg}</svg>`;
}

// Horizontal bars as plain HTML so long product names wrap nicely.
function hBars(rows, { symbol, valueKey = 'revenue', nameKey = 'name', total }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  return el('div', {}, rows.map((r) => el('div', { style: 'margin-bottom:0.55rem;' }, [
    el('div', { style: 'display:flex; justify-content:space-between; gap:0.5rem; font-size:0.85rem;' }, [
      el('span', { style: 'font-weight:600;' }, String(r[nameKey])),
      el('span', {}, `${formatMoney(r[valueKey], symbol)}${total ? ` \u00B7 ${Math.round((r[valueKey] / total) * 100)}%` : ''}`)
    ]),
    el('div', { style: 'background:var(--color-border); border-radius:4px; height:8px; margin-top:3px;' }, [
      el('div', { style: `width:${Math.max(2, (r[valueKey] / max) * 100)}%; height:100%; border-radius:4px; background:var(--color-teal);` })
    ])
  ])));
}

function card(title, ...children) {
  return el('div', { style: 'background:var(--color-surface); border:1px solid var(--color-border); border-radius:8px; padding:0.9rem 1rem;' }, [
    el('h4', { style: 'margin:0 0 0.6rem; font-size:0.95rem;' }, title),
    ...children
  ]);
}

function svgHolder(svg) {
  const div = el('div', {});
  div.innerHTML = svg;
  return div;
}

function kpi(label, value, change, { inverse = false } = {}) {
  let badge = null;
  if (change === null) {
    badge = el('div', { style: 'font-size:0.75rem; color:var(--color-text-muted);' }, 'no earlier data');
  } else if (change !== undefined) {
    const good = inverse ? change <= 0 : change >= 0;
    badge = el('div', { style: `font-size:0.78rem; font-weight:700; color:${good ? 'var(--color-green)' : 'var(--color-danger)'};` },
      `${change >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(change)}% vs previous period`);
  }
  return el('div', { style: 'background:var(--color-surface); border:1px solid var(--color-border); border-radius:8px; padding:0.8rem 1rem;' }, [
    el('div', { style: 'font-size:0.72rem; text-transform:uppercase; letter-spacing:0.04em; color:var(--color-text-muted); font-weight:700;' }, label),
    el('div', { style: 'font-size:1.45rem; font-weight:800; margin:0.15rem 0;' }, String(value)),
    badge
  ]);
}

// Plain-language findings from the numbers.
function buildInsights(d, symbol) {
  const money = (n) => formatMoney(n, symbol);
  const out = [];
  const c = d.current;

  if (!c.bills) {
    return ['No sales in this period yet. Once bills are made, this section will explain how the shop is doing.'];
  }

  if (d.change.netSales === null) {
    out.push(`Net sales were ${money(c.netSales)} from ${c.bills} bills. There were no sales in the ${d.days} days before, so there is nothing to compare with yet.`);
  } else if (d.change.netSales >= 0) {
    out.push(`Net sales were ${money(c.netSales)} \u2014 up ${d.change.netSales}% on the previous ${d.days} days (${money(d.previous.netSales)}).`);
  } else {
    out.push(`Net sales were ${money(c.netSales)} \u2014 down ${Math.abs(d.change.netSales)}% from the previous ${d.days} days (${money(d.previous.netSales)}). Check if stock ran out of best sellers or a quiet week caused it.`);
  }

  const bestDay = [...d.daily].sort((a, b) => b.sales - a.sales)[0];
  if (bestDay && bestDay.sales > 0) out.push(`Best day: ${bestDay.date} with ${money(bestDay.sales)} from ${bestDay.bills} bills.`);
  const zeroDays = d.daily.filter((x) => x.sales <= 0).length;
  if (zeroDays > 0 && d.days > 1) out.push(`${zeroDays} of ${d.days} days had no sales.`);

  const bestWeekday = [...d.byWeekday].sort((a, b) => b.sales - a.sales)[0];
  if (bestWeekday && bestWeekday.sales > 0) out.push(`${bestWeekday.label} is your strongest weekday (${money(bestWeekday.sales)}). Plan staff and stock for it.`);

  const peak = [...d.byHour].sort((a, b) => b.bills - a.bills)[0];
  if (peak && peak.bills > 0) out.push(`Busiest hour: ${hourLabel(peak.hour)}\u2013${hourLabel((peak.hour + 1) % 24)} with ${peak.bills} bills. Good time for a counter promotion.`);

  const top = d.topProducts[0];
  const revenueTotal = d.topProducts.reduce((s, p) => s + p.revenue, 0);
  if (top && top.revenue > 0) {
    const share = c.grossSales ? Math.round((top.revenue / c.grossSales) * 100) : 0;
    out.push(`Top product: ${top.name} \u2014 ${top.qty} sold, ${money(top.revenue)} (${share}% of sales).`);
    if (d.topProducts.length >= 3 && revenueTotal && (d.topProducts.slice(0, 3).reduce((s, p) => s + p.revenue, 0) / (c.grossSales || 1)) > 0.6) {
      out.push('Three products make up most of your sales \u2014 keep them well stocked.');
    }
  }

  if (d.change.avgBill !== null && d.change.avgBill !== undefined && Math.abs(d.change.avgBill) >= 5) {
    out.push(`Average bill is ${money(c.avgBill)} (${d.change.avgBill > 0 ? 'up' : 'down'} ${Math.abs(d.change.avgBill)}%). ${d.change.avgBill < 0 ? 'Suggest add-ons at the counter to lift it.' : 'Customers are buying more per visit.'}`);
  }

  if (c.grossSales && c.discounts / c.grossSales > 0.1) {
    out.push(`Discounts given were ${money(c.discounts)} \u2014 ${Math.round((c.discounts / c.grossSales) * 100)}% of sales, which is high.`);
  }
  if (c.grossSales && c.returns / c.grossSales > 0.05) {
    out.push(`Returns were ${money(c.returns)} (${Math.round((c.returns / c.grossSales) * 100)}% of sales) \u2014 worth checking the reasons.`);
  }

  if (d.customers.buyingThisPeriod > 0) {
    out.push(`${d.customers.buyingThisPeriod} saved customers bought: ${d.customers.returning} returning and ${d.customers.new} new. Use Settings \u2192 Customers to send them an offer.`);
  }
  if (d.outstandingDue > 0) out.push(`${money(d.outstandingDue)} is still due from customers.`);

  return out;
}

export async function mountDashboard(container) {
  const symbol = settingsStore.getCurrencySymbol();
  let days = 30;

  container.appendChild(el('h3', {}, 'Dashboard'));
  container.appendChild(el('p', { class: 'settings-hint' }, 'How sales are performing, compared with the same number of days just before. Test sales are not counted.'));

  const buttons = RANGES.map((r) => el('button', { class: 'btn btn-sm btn-secondary', onClick: () => { days = r.days; load(); } }, r.label));
  container.appendChild(el('div', { style: 'display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.9rem;' }, buttons));
  const body = el('div', {});
  container.appendChild(body);

  async function load() {
    buttons.forEach((b, i) => {
      b.classList.toggle('btn-primary', RANGES[i].days === days);
      b.classList.toggle('btn-secondary', RANGES[i].days !== days);
    });
    body.textContent = 'Loading...';
    try {
      const d = await apiClient.get(`/reports/dashboard?days=${days}`);
      body.innerHTML = '';
      const grid = (min) => `display:grid; grid-template-columns:repeat(auto-fit,minmax(${min}px,1fr)); gap:0.75rem; margin-bottom:0.75rem;`;
      const c = d.current;

      body.appendChild(el('div', { style: grid(170) }, [
        kpi('Net Sales', formatMoney(c.netSales, symbol), d.change.netSales),
        kpi('Bills', c.bills, d.change.bills),
        kpi('Average Bill', formatMoney(c.avgBill, symbol), d.change.avgBill),
        kpi('Items Sold', c.itemsSold, d.change.itemsSold),
        kpi('Customers Bought', d.customers.buyingThisPeriod),
        kpi('Due / Outstanding', formatMoney(d.outstandingDue, symbol))
      ]));

      body.appendChild(card('\u{1F4A1} Analysis',
        el('ul', { style: 'margin:0; padding-left:1.1rem; line-height:1.55;' }, buildInsights(d, symbol).map((t) => el('li', {}, t)))
      ));
      body.lastChild.style.marginBottom = '0.75rem';

      const everyDays = d.daily.length > 40 ? 7 : d.daily.length > 14 ? 3 : 1;
      body.appendChild(card(`Sales per day (${d.from} to ${d.to})`,
        svgHolder(barChartSvg(d.daily.map((x) => ({ label: x.label, value: Math.max(0, x.sales), tip: `${formatMoney(x.sales, symbol)} (${x.bills} bills)` })), { labelEvery: everyDays }))
      ));
      body.lastChild.style.marginBottom = '0.75rem';

      const activeHours = d.byHour.filter((h) => h.hour >= 8 && h.hour <= 23);
      body.appendChild(el('div', { style: grid(320) }, [
        card('Sales by weekday', svgHolder(barChartSvg(d.byWeekday.map((x) => ({ label: x.label, value: Math.max(0, x.sales), tip: `${formatMoney(x.sales, symbol)} (${x.bills} bills)` })), { height: 200 }))),
        card('Busy hours (bills per hour)', svgHolder(barChartSvg(activeHours.map((x) => ({ label: hourLabel(x.hour).replace(' ', ''), value: x.bills, tip: `${x.bills} bills` })), { height: 200, color: 'var(--color-warning)', labelEvery: 2 })))
      ]));

      body.appendChild(el('div', { style: grid(320) }, [
        card('Top products by sales', d.topProducts.length
          ? hBars(d.topProducts, { symbol, total: c.grossSales })
          : el('p', { class: 'settings-hint' }, 'No product sales yet.')),
        card('How customers paid', d.paymentMethods.length
          ? hBars(d.paymentMethods.map((m) => ({ name: m.method, revenue: m.amount })), { symbol, total: c.grossSales })
          : el('p', { class: 'settings-hint' }, 'No payments yet.'))
      ]));
    } catch (err) {
      body.textContent = 'Could not load the dashboard.';
      notification.error(`Failed to load dashboard: ${err.message}`);
    }
  }

  await load();
}
