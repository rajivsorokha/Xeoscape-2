// assets/js/shared/date-ranges.js
// Frontend date-range preset math for the Transactions date picker:
// Today, Yesterday, Last 7 Days, Last 30 Days, This Month, Last Month.
// Mirrors core/report-ranges.js in spirit but lives client-side since
// it drives UI state (the picker button label), not just API queries.

export const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 Days' },
  { id: 'last30', label: 'Last 30 Days' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
  { id: 'custom', label: 'Custom Range' }
];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d, n) { return new Date(d.getTime() + n * 24 * 60 * 60 * 1000); }

export function resolvePreset(id, now = new Date()) {
  switch (id) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': {
      const y = addDays(now, -1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'last7':
      return { from: startOfDay(addDays(now, -6)), to: endOfDay(now) };
    case 'last30':
      return { from: startOfDay(addDays(now, -29)), to: endOfDay(now) };
    case 'thisMonth':
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    case 'lastMonth': {
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastOfPrevMonth = addDays(firstOfThisMonth, -1);
      const firstOfPrevMonth = new Date(lastOfPrevMonth.getFullYear(), lastOfPrevMonth.getMonth(), 1);
      return { from: startOfDay(firstOfPrevMonth), to: endOfDay(lastOfPrevMonth) };
    }
    default:
      throw new Error(`Unknown date preset: ${id}`);
  }
}

export function formatDateShort(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatRangeLabel(from, to) {
  return `${formatDateShort(from)} \u2013 ${formatDateShort(to)}`;
}
