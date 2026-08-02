// core/report-ranges.js
// Pure helper for turning a named preset ("today", "2days", "week",
// "month") into a concrete { from, to } ISO date range. Kept separate
// and dependency-free so it's easy to unit test.

const PRESETS = ['today', '2days', 'week', 'month'];

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * @param {string} preset - one of "today", "2days", "week", "month"
 * @param {Date} [now] - injectable for testing
 * @returns {{ from: string, to: string, label: string }}
 */
function resolveRange(preset, now = new Date()) {
  if (!PRESETS.includes(preset)) {
    throw new Error(`Unknown report range: ${preset}. Expected one of: ${PRESETS.join(', ')}`);
  }

  const to = endOfDay(now);
  let from;
  let label;

  switch (preset) {
    case 'today':
      from = startOfDay(now);
      label = 'Today';
      break;
    case '2days':
      from = startOfDay(new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000));
      label = 'Last 2 Days';
      break;
    case 'week':
      from = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
      label = 'Last 7 Days';
      break;
    case 'month':
      from = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
      label = 'Last 30 Days';
      break;
  }

  return { from: from.toISOString(), to: to.toISOString(), label };
}

module.exports = { resolveRange, PRESETS };
