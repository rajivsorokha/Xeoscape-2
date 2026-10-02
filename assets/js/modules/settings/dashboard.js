// assets/js/modules/settings/dashboard.js
// Settings -> Dashboard: sales performance graphs and a plain-language
// analysis. Charts are drawn as inline SVG / HTML (no chart library, no
// internet needed), data comes from GET /api/reports/dashboard.
//
// Visual style: modern admin dashboard -- white rounded cards with soft
// shadows, orange primary accent, dark-teal secondary, icon chips,
// pill range switcher, gradient area chart, heat-level tiles.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import notification from '../../ui/notification.js';

const RANGES = [
  { days: 7, label: '7 Days' },
  { days: 30, label: '30 Days' },
  { days: 90, label: '90 Days' }
];

// Palette (matches the reference dashboard look)
const C = {
  orange: '#f26522',
  orangeSoft: '#fff1e8',
  teal: '#0c4a5e',
  yellow: '#fbbf24',
  green: '#22c55e',
  red: '#dc2626',
  text: '#111827',
  muted: '#6b7280',
  line: '#e5e7eb',
  track: '#eceef1'
};
const SERIES_COLORS = [C.orange, C.teal, '#1f2937', C.yellow, '#fb923c', '#64748b'];

const STYLE = `
.xd { --xd-orange:${C.orange}; --xd-teal:${C.teal}; color:${C.text}; font-size:0.9rem; }
.xd * { box-sizing:border-box; }
.xd-head { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap; margin-bottom:1rem; }
.xd-title { margin:0; font-size:1.45rem; font-weight:800; letter-spacing:-0.01em; }
.xd-crumb { margin-top:0.25rem; font-size:0.8rem; color:${C.muted}; }
.xd-crumb b { color:${C.text}; font-weight:600; }
.xd-sub { margin:0.35rem 0 0; font-size:0.8rem; color:${C.muted}; max-width:560px; }
.xd-seg { display:inline-flex; gap:2px; background:#fff; border:1px solid ${C.line}; border-radius:10px; padding:4px; box-shadow:0 1px 2px rgba(16,24,40,.04); }
.xd-seg button { border:0; background:transparent; color:${C.text}; font:inherit; font-weight:600; font-size:0.82rem; padding:0.4rem 0.95rem; border-radius:7px; cursor:pointer; }
.xd-seg button:hover { background:#f3f4f6; }
.xd-seg button.on { background:${C.orange}; color:#fff; }
.xd-grid { display:grid; gap:1rem; margin-bottom:1rem; }
.xd-kpis { grid-template-columns:repeat(3,minmax(0,1fr)); }
@media (max-width:760px) { .xd-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:460px) { .xd-kpis { grid-template-columns:1fr; } }
.xd-2 { grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); }
.xd-wide { grid-template-columns:minmax(0,2fr) minmax(280px,1fr); }
.xd-card { background:#fff; border:1px solid #eef0f3; border-radius:12px; padding:1rem 1.1rem; box-shadow:0 1px 2px rgba(16,24,40,.04); min-width:0; }
.xd-chead { display:flex; align-items:center; justify-content:space-between; gap:0.6rem; margin-bottom:0.9rem; }
.xd-ctitle { display:flex; align-items:center; gap:0.5rem; font-weight:700; font-size:0.95rem; }
.xd-ctitle svg { color:${C.orange}; flex:none; }
.xd-pill { font-size:0.72rem; font-weight:600; color:${C.muted}; border:1px solid ${C.line}; border-radius:8px; padding:0.2rem 0.55rem; background:#fff; white-space:nowrap; }
.xd-kpi { display:flex; flex-direction:column; gap:0.55rem; }
.xd-krow { display:flex; align-items:center; justify-content:space-between; gap:0.5rem; }
.xd-klabel { color:${C.muted}; font-size:0.84rem; }
.xd-chip { width:34px; height:34px; border-radius:50%; border:1px solid ${C.line}; background:#fff; display:flex; align-items:center; justify-content:center; color:${C.text}; flex:none; }
.xd-kvalue { font-size:1.6rem; font-weight:800; letter-spacing:-0.02em; line-height:1.1; }
.xd-kfoot { display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; font-size:0.74rem; color:${C.muted}; }
.xd-delta { display:inline-flex; align-items:center; gap:2px; font-weight:700; font-size:0.74rem; padding:0.1rem 0.45rem; border-radius:999px; }
.xd-delta.up { color:#15803d; background:#dcfce7; }
.xd-delta.down { color:${C.red}; background:#fee2e2; }
.xd-spark { flex:none; }
.xd-bars { display:flex; gap:0.7rem; align-items:flex-end; height:250px; padding:0 0 0 2.2rem; position:relative; }
.xd-ygrid { position:absolute; left:0; right:0; top:0; bottom:26px; pointer-events:none; }
.xd-yline { position:absolute; left:2.2rem; right:0; border-top:1px dashed ${C.line}; }
.xd-ylab { position:absolute; left:0; width:2rem; text-align:right; font-size:0.68rem; color:${C.muted}; transform:translateY(-50%); }
.xd-col { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; height:100%; position:relative; z-index:1; }
.xd-track { flex:1; width:100%; max-width:74px; background:${C.track}; border-radius:14px; position:relative; overflow:hidden; display:flex; align-items:flex-end; }
.xd-fill { width:100%; border-radius:14px; display:flex; align-items:flex-start; justify-content:center; padding-top:8px; color:#fff; font-size:0.72rem; font-weight:700; transition:height .3s; min-height:0; }
.xd-fill.small { color:transparent; }
.xd-colv { position:absolute; left:0; right:0; text-align:center; font-size:0.72rem; font-weight:700; color:${C.text}; }
.xd-xlab { font-size:0.76rem; color:${C.muted}; height:20px; }
.xd-legend { display:flex; gap:0.9rem; flex-wrap:wrap; font-size:0.74rem; color:${C.muted}; }
.xd-legend i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px; vertical-align:-1px; }
.xd-tiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:0.7rem; }
.xd-tile { border:1px solid ${C.line}; border-radius:10px; padding:0.65rem 0.8rem; background:#fff; }
.xd-tile .t { display:flex; justify-content:space-between; align-items:center; font-size:0.76rem; color:${C.muted}; }
.xd-tile .t i { width:7px; height:7px; border-radius:50%; display:inline-block; }
.xd-tile .v { font-weight:800; font-size:1.05rem; margin:0.25rem 0 0.45rem; }
.xd-tile .v small { font-weight:500; font-size:0.7rem; color:${C.muted}; }
.xd-meter { height:4px; border-radius:4px; background:${C.track}; overflow:hidden; }
.xd-meter b { display:block; height:100%; border-radius:4px; }
.xd-stack { display:flex; gap:3px; height:12px; margin:0.2rem 0 1rem; }
.xd-stack span { border-radius:4px; min-width:6px; }
.xd-row { display:flex; align-items:center; gap:0.6rem; padding:0.5rem 0; border-top:1px solid #f1f2f4; }
.xd-row:first-of-type { border-top:0; }
.xd-dot { width:10px; height:10px; border-radius:3px; flex:none; }
.xd-rank { width:24px; height:24px; border-radius:50%; background:${C.orangeSoft}; color:${C.orange}; font-weight:700; font-size:0.74rem; display:flex; align-items:center; justify-content:center; flex:none; }
.xd-grow { flex:1; min-width:0; }
.xd-name { font-weight:600; font-size:0.86rem; overflow:hidden; text-overflow:ellipsis; }
.xd-amt { font-weight:700; font-size:0.86rem; white-space:nowrap; }
.xd-pct { color:${C.muted}; font-size:0.74rem; margin-left:0.35rem; font-weight:500; }
.xd-hbar { height:5px; border-radius:4px; background:${C.track}; margin-top:5px; overflow:hidden; }
.xd-hbar b { display:block; height:100%; background:${C.orange}; border-radius:4px; }
.xd-insights { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:0.6rem; }
.xd-insights li { position:relative; padding-left:1.1rem; line-height:1.5; font-size:0.86rem; }
.xd-insights li::before { content:''; position:absolute; left:0; top:0.5em; width:7px; height:7px; border-radius:50%; background:${C.orange}; }
.xd-pt { opacity:0; cursor:pointer; }
.xd-pt:hover { opacity:1; }
.xd-empty { color:${C.muted}; font-size:0.85rem; margin:0; }
.xd-section { display:flex; align-items:baseline; gap:0.7rem; margin:1.6rem 0 0.8rem; }
.xd-section h4 { margin:0; font-size:1.1rem; font-weight:800; }
.xd-section span { color:${C.muted}; font-size:0.8rem; }
.xd-mx { width:100%; border-collapse:separate; border-spacing:4px; font-size:0.8rem; }
.xd-mx th { font-weight:600; color:${C.muted}; font-size:0.74rem; padding:2px 4px; text-align:center; }
.xd-mx th.r { text-align:left; white-space:nowrap; color:${C.text}; padding-right:0.6rem; }
.xd-mx td { text-align:center; border-radius:8px; padding:0.35rem 0.2rem; min-width:46px; }
.xd-mx td .n { font-weight:800; font-size:0.95rem; line-height:1.1; }
.xd-mx td .s { font-size:0.62rem; opacity:.8; }
.xd-mx td.out { outline:2px solid ${C.red}; outline-offset:-2px; }
.xd-note { margin:0.7rem 0 0; font-size:0.72rem; color:${C.muted}; }
.xd-curve { display:flex; flex-direction:column; gap:0.55rem; }
.xd-crow { display:grid; grid-template-columns:52px 1fr; gap:0.6rem; align-items:center; }
.xd-crow .sz { font-weight:700; font-size:0.84rem; }
.xd-crow .m { display:flex; align-items:center; gap:0.5rem; font-size:0.7rem; color:${C.muted}; }
.xd-crow .m + .m { margin-top:3px; }
.xd-crow .m .bar { flex:1; height:6px; border-radius:4px; background:${C.track}; overflow:hidden; }
.xd-crow .m .bar b { display:block; height:100%; border-radius:4px; }
.xd-crow .m .num { width:78px; text-align:right; }
.xd-badge { font-size:0.68rem; font-weight:700; padding:0.12rem 0.5rem; border-radius:999px; white-space:nowrap; }
.xd-badge.red { color:${C.red}; background:#fee2e2; }
.xd-badge.amber { color:#b45309; background:#fef3c7; }
.xd-badge.gray { color:${C.muted}; background:#f3f4f6; }
.xd-sub2 { font-size:0.74rem; color:${C.muted}; font-weight:500; margin-top:1px; }
@media (max-width:900px) { .xd-wide { grid-template-columns:1fr; } }
`;

function ensureStyle() {
  if (document.getElementById('xd-style')) return;
  const s = document.createElement('style');
  s.id = 'xd-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

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

// Simple stroke icons (24x24).
const ICONS = {
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<rect x="4" y="12" width="4" height="8" rx="1"/><rect x="10" y="4" width="4" height="16" rx="1"/><rect x="16" y="9" width="4" height="11" rx="1"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
  star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  margin: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
};

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

function html(tag, cls, inner) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  n.innerHTML = inner;
  return n;
}

function svgHolder(svg) {
  const div = el('div', {});
  div.innerHTML = svg;
  return div;
}

// Card with icon + title header. `right` is an optional node/string.
function card(title, iconName, children, right) {
  const head = el('div', { class: 'xd-chead' }, [
    html('div', 'xd-ctitle', `${iconName ? icon(iconName) : ''}<span>${esc(title)}</span>`),
    right ? (typeof right === 'string' ? el('span', { class: 'xd-pill' }, right) : right) : null
  ]);
  return el('div', { class: 'xd-card' }, [head, ...(Array.isArray(children) ? children : [children])]);
}

let sparkId = 0;
function sparkline(values, color = C.orange, w = 96, h = 40) {
  if (!values || values.length < 2 || Math.max(...values) <= 0) return null;
  sparkId += 1;
  const max = Math.max(...values);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)]);
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  const wrap = el('div', { class: 'xd-spark' });
  wrap.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs><linearGradient id="xds${sparkId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><polygon points="${area}" fill="url(#xds${sparkId})"/><polyline points="${line}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  return wrap;
}

function deltaChip(change) {
  if (change === null) return el('span', {}, 'no earlier data');
  if (change === undefined) return null;
  const up = change >= 0;
  return el('span', { class: 'xd-foot-wrap', style: 'display:contents;' }, [
    el('span', { class: `xd-delta ${up ? 'up' : 'down'}` }, `${up ? '\u25B2' : '\u25BC'} ${Math.abs(change)}%`),
    el('span', {}, 'vs previous period')
  ]);
}

function kpi(label, value, change, iconName, series, foot) {
  const spark = sparkline(series);
  return el('div', { class: 'xd-card xd-kpi' }, [
    el('div', { class: 'xd-krow' }, [
      el('span', { class: 'xd-klabel' }, label),
      html('span', 'xd-chip', icon(iconName))
    ]),
    el('div', { class: 'xd-krow' }, [
      el('div', { class: 'xd-kvalue' }, String(value)),
      spark
    ]),
    el('div', { class: 'xd-kfoot' }, [deltaChip(change) || (foot ? el('span', {}, foot) : null)])
  ]);
}

// Rounded "track" bar columns with a y-axis grid (like the storage chart).
function trackBars(items, { height = 250, fmt = (v) => compact(v) } = {}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const maxIndex = items.findIndex((i) => i.value === max);
  const wrap = el('div', { class: 'xd-bars', style: `height:${height}px;` });
  const grid = el('div', { class: 'xd-ygrid' });
  for (let g = 0; g <= 4; g += 1) {
    const pct = (g / 4) * 100;
    grid.appendChild(el('div', { class: 'xd-yline', style: `top:${100 - pct}%;` }));
    grid.appendChild(el('div', { class: 'xd-ylab', style: `top:${100 - pct}%;` }, compact((max * g) / 4)));
  }
  wrap.appendChild(grid);
  items.forEach((item, i) => {
    const pct = (item.value / max) * 100;
    const isMax = i === maxIndex && item.value > 0;
    const fill = el('div', {
      class: `xd-fill${pct < 14 ? ' small' : ''}`,
      style: `height:${pct}%; background:${isMax ? C.orange : C.teal};`,
      title: item.tip || ''
    }, pct >= 14 ? fmt(item.value) : '');
    const track = el('div', { class: 'xd-track' }, [fill]);
    if (pct < 14 && item.value > 0) {
      track.appendChild(el('div', { class: 'xd-colv', style: `bottom:calc(${pct}% + 4px);` }, fmt(item.value)));
    }
    wrap.appendChild(el('div', { class: 'xd-col' }, [track, el('div', { class: 'xd-xlab' }, item.label)]));
  });
  return wrap;
}

// Gradient area chart with a callout on the peak (like "Login Count Analysis").
function areaChartSvg(items, { height = 260, labelEvery = 1, tipFmt } = {}) {
  const W = 900;
  const pad = { l: 48, r: 12, t: 38, b: 28 };
  const innerW = W - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(1, ...items.map((i) => i.value));
  const step = items.length > 1 ? innerW / (items.length - 1) : 0;
  const pts = items.map((it, i) => [pad.l + i * step, pad.t + innerH - (it.value / max) * innerH]);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${pad.l},${pad.t + innerH} ${line} ${pad.l + (items.length - 1) * step},${pad.t + innerH}`;
  const maxIndex = items.findIndex((i) => i.value === max);

  let svg = `<svg viewBox="0 0 ${W} ${height}" style="width:100%; height:auto; display:block;" role="img"><defs><linearGradient id="xdarea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.orange}" stop-opacity=".30"/><stop offset="1" stop-color="${C.orange}" stop-opacity=".02"/></linearGradient></defs>`;
  for (let g = 0; g <= 4; g += 1) {
    const y = pad.t + innerH - (innerH * g) / 4;
    svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="${C.line}" stroke-dasharray="4 4"/>`;
    svg += `<text x="${pad.l - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="${C.muted}">${compact((max * g) / 4)}</text>`;
  }
  svg += `<polygon points="${area}" fill="url(#xdarea)"/><polyline points="${line}" fill="none" stroke="${C.orange}" stroke-width="2" stroke-linejoin="round"/>`;
  items.forEach((it, i) => {
    const [x, y] = pts[i];
    svg += `<circle class="xd-pt" cx="${x}" cy="${y}" r="5" fill="#fff" stroke="${C.orange}" stroke-width="2"><title>${esc(it.label)}: ${esc(it.tip ?? it.value)}</title></circle>`;
    if (i % labelEvery === 0) svg += `<text x="${x}" y="${height - 8}" text-anchor="middle" font-size="11" fill="${C.muted}">${esc(it.label)}</text>`;
  });
  if (maxIndex >= 0 && items[maxIndex].value > 0) {
    const [x, y] = pts[maxIndex];
    const bw = 132;
    const bx = Math.min(Math.max(x - bw / 2, pad.l), W - pad.r - bw);
    const by = Math.max(2, y - 46);
    svg += `<line x1="${x}" x2="${x}" y1="${y}" y2="${pad.t + innerH}" stroke="${C.orange}" stroke-dasharray="3 3" opacity=".5"/>`;
    svg += `<circle cx="${x}" cy="${y}" r="5" fill="${C.orange}" stroke="#fff" stroke-width="2"/>`;
    svg += `<rect x="${bx}" y="${by}" width="${bw}" height="38" rx="8" fill="#fff" stroke="${C.line}"/>`;
    svg += `<text x="${bx + 10}" y="${by + 16}" font-size="11" font-weight="700" fill="${C.text}">${esc(items[maxIndex].label)} (peak)</text>`;
    svg += `<circle cx="${bx + 14}" cy="${by + 28}" r="3" fill="${C.orange}"/><text x="${bx + 22}" y="${by + 31}" font-size="11" fill="${C.muted}">${esc(tipFmt ? tipFmt(items[maxIndex]) : items[maxIndex].value)}</text>`;
  }
  return `${svg}</svg>`;
}

// Heat level for the busy-hour tiles.
function level(pct) {
  if (pct >= 90) return { name: 'Peak', color: C.red };
  if (pct >= 70) return { name: 'High', color: C.orange };
  if (pct >= 50) return { name: 'Medium', color: C.yellow };
  return { name: 'Low', color: C.green };
}

function busyTiles(rows) {
  const max = Math.max(1, ...rows.map((r) => r.bills));
  return el('div', { class: 'xd-tiles' }, rows.map((r) => {
    const pct = Math.round((r.bills / max) * 100);
    const lv = level(pct);
    return el('div', { class: 'xd-tile', title: `${r.bills} bills` }, [
      el('div', { class: 't' }, [el('span', {}, hourLabel(r.hour)), el('i', { style: `background:${lv.color};` })]),
      html('div', 'v', `${r.bills} <small>bills</small>`),
      el('div', { class: 'xd-meter' }, [el('b', { style: `width:${pct}%; background:${lv.color};` })])
    ]);
  }));
}

function sectionTitle(title, sub) {
  return el('div', { class: 'xd-section' }, [el('h4', {}, title), sub ? el('span', {}, sub) : null]);
}

// Size x colour grid: number = units sold, small text = units left.
function matrixCard(m) {
  const all = m.rows.flatMap((r) => r.cells.map((c) => c.sold));
  const max = Math.max(1, ...all);
  let t = '<div style="overflow-x:auto"><table class="xd-mx"><thead><tr><th></th>';
  t += m.sizes.map((sz) => `<th>${esc(sz)}</th>`).join('');
  t += '</tr></thead><tbody>';
  m.rows.forEach((r) => {
    t += `<tr><th class="r">${esc(r.color)}</th>`;
    r.cells.forEach((c) => {
      const k = c.sold > 0 ? 0.14 + 0.86 * (c.sold / max) : 0;
      const bg = c.sold > 0 ? `rgba(242,101,34,${k.toFixed(2)})` : C.track;
      const fg = k > 0.55 ? '#fff' : C.text;
      const out = c.sold > 0 && c.stock <= 0 ? ' out' : '';
      t += `<td class="${out.trim()}" style="background:${bg}; color:${fg};" title="${esc(r.color)} ${esc(c.size)}: ${c.sold} sold, ${c.stock} left"><div class="n">${c.sold}</div><div class="s">${c.stock} left</div></td>`;
    });
    t += '</tr>';
  });
  t += '</tbody></table></div>';
  t += `<p class="xd-note">Darker = sells more. A red outline means that size and colour sold but has run out.</p>`;
  return svgHolder(t);
}

// Sold vs in-stock per size -- shows where the size run is thin.
function sizeCurve(rows) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.sold, r.stock]));
  return el('div', { class: 'xd-curve' }, rows.map((r) => el('div', { class: 'xd-crow' }, [
    el('div', { class: 'sz' }, r.label),
    el('div', {}, [
      html('div', 'm', `<span class="bar"><b style="width:${(r.sold / max) * 100}%; background:${C.orange};"></b></span><span class="num">${r.sold} sold</span>`),
      html('div', 'm', `<span class="bar"><b style="width:${(r.stock / max) * 100}%; background:${C.teal};"></b></span><span class="num">${r.stock} in stock</span>`)
    ])
  ])));
}

function simpleList(rows, render, emptyText) {
  if (!rows.length) return el('p', { class: 'xd-empty' }, emptyText);
  return el('div', {}, rows.map((r) => el('div', { class: 'xd-row' }, render(r))));
}

function countSplit(c) {
  const rows = [
    { name: 'New customers', value: c.new, color: C.orange },
    { name: 'Returning customers', value: c.returning, color: C.teal }
  ];
  const sum = Math.max(1, c.new + c.returning);
  const stack = el('div', { class: 'xd-stack' }, rows.map((r) => el('span', { style: `flex:${Math.max(r.value, sum * 0.03)}; background:${r.color};`, title: r.name })));
  const list = el('div', {}, rows.map((r) => el('div', { class: 'xd-row' }, [
    el('span', { class: 'xd-dot', style: `background:${r.color};` }),
    el('div', { class: 'xd-grow xd-name' }, r.name),
    el('div', { class: 'xd-amt' }, [String(r.value), el('span', { class: 'xd-pct' }, `${Math.round((r.value / sum) * 100)}%`)])
  ])));
  return el('div', {}, [stack, list, el('p', { class: 'xd-note' }, `${c.total} customers saved in total.`)]);
}

function legend(items) {
  return html('div', 'xd-legend', items.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join(''));
}

// Segmented bar + legend rows (like "User Roles Distribution").
function distribution(rows, { symbol, total }) {
  const sum = Math.max(1, rows.reduce((a, r) => a + r.value, 0));
  const stack = el('div', { class: 'xd-stack' }, rows.map((r, i) =>
    el('span', { style: `flex:${Math.max(r.value, sum * 0.015)}; background:${SERIES_COLORS[i % SERIES_COLORS.length]};`, title: r.name })));
  const list = el('div', {}, rows.map((r, i) => el('div', { class: 'xd-row' }, [
    el('span', { class: 'xd-dot', style: `background:${SERIES_COLORS[i % SERIES_COLORS.length]};` }),
    el('div', { class: 'xd-grow xd-name' }, r.name),
    el('div', { class: 'xd-amt' }, [formatMoney(r.value, symbol), el('span', { class: 'xd-pct' }, `${Math.round((r.value / sum) * 100)}%`)])
  ])));
  return el('div', {}, [stack, list]);
}

function rankedList(rows, { symbol, total }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return el('div', {}, rows.map((r, i) => el('div', { class: 'xd-row' }, [
    el('span', { class: 'xd-rank' }, String(i + 1)),
    el('div', { class: 'xd-grow' }, [
      el('div', { style: 'display:flex; justify-content:space-between; gap:0.5rem;' }, [
        el('span', { class: 'xd-name' }, String(r.name)),
        el('span', { class: 'xd-amt' }, [formatMoney(r.revenue, symbol), total ? el('span', { class: 'xd-pct' }, `${Math.round((r.revenue / total) * 100)}%`) : null])
      ]),
      el('div', { class: 'xd-hbar' }, [el('b', { style: `width:${Math.max(3, (r.revenue / max) * 100)}%;` })])
    ])
  ])));
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

  const m = d.merch;
  if (m) {
    if (m.outOfStock > 0) out.push(`${m.outOfStock} item${m.outOfStock === 1 ? ' is' : 's are'} out of stock. Check the reorder list below.`);
    const gaps = (m.sizeCurve || []).filter((x) => x.sold > 0 && x.stock <= 0).map((x) => x.label);
    if (gaps.length) out.push(`Size gap: ${gaps.join(', ')} sold but ${gaps.length === 1 ? 'is' : 'are'} now out of stock.`);
    if (m.slowMoverCount > 0) out.push(`${m.slowMoverCount} item${m.slowMoverCount === 1 ? '' : 's'} (${money(m.slowMoverValue)} of stock) had no sales in this period. Consider a markdown or a bundle offer.`);
    if (m.sellThroughPct !== null) out.push(`Sell-through is ${m.sellThroughPct}%${m.stockCoverDays !== null ? `, enough stock for about ${m.stockCoverDays} days at this pace` : ''}.`);
    if (m.returnRatePct >= 10) out.push(`Returns are ${m.returnRatePct}% of bills. Check fit, quality or sizing for the most-returned items.`);
  }

  return out;
}

export async function mountDashboard(container) {
  ensureStyle();
  const symbol = settingsStore.getCurrencySymbol();
  let days = 30;

  const root = el('div', { class: 'xd' });
  container.appendChild(root);

  const buttons = RANGES.map((r) => el('button', { type: 'button', onClick: () => { days = r.days; load(); } }, r.label));
  root.appendChild(el('div', { class: 'xd-head' }, [
    el('div', {}, [
      el('h3', { class: 'xd-title' }, 'Sales Dashboard'),
      html('div', 'xd-crumb', 'Settings &nbsp;\u203A&nbsp; <b>Dashboard</b>'),
      el('p', { class: 'xd-sub' }, 'How sales are performing, compared with the same number of days just before. Test sales are not counted.')
    ]),
    el('div', { class: 'xd-seg' }, buttons)
  ]));
  const body = el('div', {});
  root.appendChild(body);

  async function load() {
    buttons.forEach((b, i) => b.classList.toggle('on', RANGES[i].days === days));
    body.textContent = 'Loading...';
    try {
      const d = await apiClient.get(`/reports/dashboard?days=${days}`);
      body.innerHTML = '';
      const c = d.current;
      const grid = (cls, kids) => el('div', { class: `xd-grid ${cls}` }, kids);

      const salesSeries = d.daily.map((x) => Math.max(0, x.sales));
      const billSeries = d.daily.map((x) => x.bills);
      const avgSeries = d.daily.map((x) => (x.bills ? Math.max(0, x.sales) / x.bills : 0));

      body.appendChild(grid('xd-kpis', [
        kpi('Net Sales', formatMoney(c.netSales, symbol), d.change.netSales, 'wallet', salesSeries),
        kpi('Bills', c.bills, d.change.bills, 'receipt', billSeries),
        kpi('Average Bill', formatMoney(c.avgBill, symbol), d.change.avgBill, 'trend', avgSeries),
        kpi('Items Sold', c.itemsSold, d.change.itemsSold, 'box', null),
        kpi('Customers Bought', d.customers.buyingThisPeriod, undefined, 'users', null, 'saved customers this period'),
        kpi('Due / Outstanding', formatMoney(d.outstandingDue, symbol), undefined, 'clock', null, 'still to collect')
      ]));

      // Weekday bars + payment split
      const weekdayItems = d.byWeekday.map((x) => ({ label: x.label, value: Math.max(0, x.sales), tip: `${formatMoney(x.sales, symbol)} (${x.bills} bills)` }));
      const payRows = d.paymentMethods.map((m) => ({ name: m.method, value: m.amount }));
      body.appendChild(grid('xd-wide', [
        card('Sales by Weekday', 'chart', trackBars(weekdayItems), `${d.from} \u2192 ${d.to}`),
        card('How Customers Paid', 'card', payRows.length
          ? distribution(payRows, { symbol, total: c.grossSales })
          : el('p', { class: 'xd-empty' }, 'No payments yet.'))
      ]));

      // Busy hours heat tiles
      const activeHours = d.byHour.filter((h) => h.hour >= 8 && h.hour <= 23);
      body.appendChild(grid('', [
        card('Busy Hours (bills per hour)', 'clock', [
          el('div', { style: 'margin-bottom:0.8rem;' }, [legend([[C.green, 'Low (0-50%)'], [C.yellow, 'Medium (50-70%)'], [C.orange, 'High (70-90%)'], [C.red, 'Peak (90-100%)']])]),
          busyTiles(activeHours)
        ])
      ]));

      // Sales per day (area)
      const everyDays = d.daily.length > 40 ? 7 : d.daily.length > 14 ? 3 : 1;
      const dailyItems = d.daily.map((x) => ({ label: x.label, value: Math.max(0, x.sales), tip: `${formatMoney(x.sales, symbol)} (${x.bills} bills)`, sales: x.sales }));
      body.appendChild(grid('', [
        card('Sales per Day', 'pulse', svgHolder(areaChartSvg(dailyItems, { labelEvery: everyDays, tipFmt: (it) => `Sales: ${formatMoney(it.sales, symbol)}` })), `${d.from} \u2192 ${d.to}`)
      ]));

      // Stock & merchandising (clothing-store view)
      const m = d.merch;
      if (m) {
        body.appendChild(sectionTitle('Stock & Merchandising', 'What is selling, what is stuck, what to reorder'));
        body.appendChild(grid('xd-kpis', [
          kpi('Sell-Through', m.sellThroughPct === null ? '\u2014' : `${m.sellThroughPct}%`, undefined, 'gauge', null, 'of stock sold in this period'),
          kpi('Stock Cover', m.stockCoverDays === null ? '\u2014' : `${m.stockCoverDays} days`, undefined, 'cal', null, m.stockCoverDays === null ? 'no sales to measure yet' : 'at the current selling pace'),
          kpi('Stock Value', formatMoney(m.stockCostValue, symbol), undefined, 'layers', null, `${m.unitsOnHand} units \u00B7 retail ${formatMoney(m.stockRetailValue, symbol)}`),
          kpi('Return Rate', `${m.returnRatePct}%`, undefined, 'undo', null, `${m.returnsCount} return${m.returnsCount === 1 ? '' : 's'} \u00B7 ${formatMoney(m.returnedValue, symbol)}`),
          kpi('Gross Margin', m.marginPct === null ? '\u2014' : `${m.marginPct}%`, undefined, 'margin', null, m.grossProfit === null ? 'add a cost price to products' : `profit ${formatMoney(m.grossProfit, symbol)}`),
          kpi('Discounts Given', formatMoney(m.discounts, symbol), undefined, 'percent', null, 'in this period')
        ]));

        const hasMatrix = m.matrix && m.matrix.rows.length && m.matrix.sizes.length;
        if (hasMatrix || (m.sizeCurve && m.sizeCurve.length)) {
          body.appendChild(grid('xd-wide', [
            hasMatrix ? card('Size \u00D7 Colour Sales', 'grid', matrixCard(m.matrix), 'top colours') : el('div', {}),
            card('Size Curve', 'chart', m.sizeCurve.length ? sizeCurve(m.sizeCurve) : el('p', { class: 'xd-empty' }, 'Add sizes to your products to see this.'))
          ]));
        }

        body.appendChild(grid('xd-2', [
          card('Needs Reorder', 'alert', simpleList(m.needsReorder, (r) => [
            el('div', { class: 'xd-grow' }, [el('div', { class: 'xd-name' }, r.name), el('div', { class: 'xd-sub2' }, `reorder at ${r.reorderPoint}${r.sold ? ` \u00B7 ${r.sold} sold` : ''}`)]),
            el('span', { class: `xd-badge ${r.stock <= 0 ? 'red' : 'amber'}` }, r.stock <= 0 ? 'Out of stock' : `${r.stock} left`)
          ], 'Nothing needs reordering right now.'), m.reorderCount ? `${m.reorderCount} item${m.reorderCount === 1 ? '' : 's'}` : null),
          card('Slow Movers \u2013 Consider Markdown', 'tag', simpleList(m.slowMovers, (r) => [
            el('div', { class: 'xd-grow' }, [el('div', { class: 'xd-name' }, r.name), el('div', { class: 'xd-sub2' }, [r.size, r.color].filter(Boolean).join(' \u00B7 ') || 'no sales in this period')]),
            el('div', { class: 'xd-amt' }, [formatMoney(r.value, symbol), el('span', { class: 'xd-pct' }, `${r.stock} pcs`)])
          ], 'Everything in stock has sold at least once.'), m.slowMoverCount ? `${formatMoney(m.slowMoverValue, symbol)} tied up` : null)
        ]));

        body.appendChild(grid('xd-2', [
          card('Sales by Garment Type', 'box', m.byGarment.length
            ? distribution(m.byGarment.map((g) => ({ name: `${g.name} \u00B7 ${g.units} pcs`, value: Math.max(0, g.revenue) })), { symbol })
            : el('p', { class: 'xd-empty' }, 'No sales yet.')),
          card('Customer Mix', 'users', d.customers.buyingThisPeriod
            ? countSplit(d.customers)
            : el('p', { class: 'xd-empty' }, 'No saved customers on bills in this period. Attach a customer at checkout to track repeat buyers.'))
        ]));
      }

      // Top products + analysis
      body.appendChild(grid('xd-2', [
        card('Top Products by Sales', 'star', d.topProducts.length
          ? rankedList(d.topProducts, { symbol, total: c.grossSales })
          : el('p', { class: 'xd-empty' }, 'No product sales yet.')),
        card('Analysis', 'bulb', el('ul', { class: 'xd-insights' }, buildInsights(d, symbol).map((t) => el('li', {}, t))))
      ]));
    } catch (err) {
      body.textContent = 'Could not load the dashboard.';
      notification.error(`Failed to load dashboard: ${err.message}`);
    }
  }

  await load();
}
