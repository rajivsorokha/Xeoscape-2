// assets/js/shared/formatters.js
// Consistent date/money formatting across the whole app.

export function formatCurrency(amount, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount || 0);
}

/**
 * Formats an amount using an arbitrary currency symbol/code (e.g. "UGX",
 * "KES") rather than a strict ISO currency code, since store profiles
 * can set any free-text symbol.
 */
export function formatMoney(amount, symbol = '$') {
  const formatted = Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${symbol} ${formatted}`;
}

export function formatDate(isoString, locale = 'en-US') {
  if (!isoString) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoString));
}

export function formatShortDate(isoString, locale = 'en-US') {
  if (!isoString) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(isoString));
}
