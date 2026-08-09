// assets/js/shared/formatters.js
// Consistent date/money formatting across the whole app.

import settingsStore from './settings-store.js';

export function formatCurrency(amount, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount || 0);
}

/**
 * Formats an amount using an arbitrary currency symbol/code (e.g. "UGX",
 * "KES") rather than a strict ISO currency code, since store profiles
 * can set any free-text symbol.
 *
 * `symbol` defaults to the store's configured currency symbol (Settings
 * -> Store Profile, e.g. \u20B9) rather than a hardcoded "$" -- this is a
 * default parameter, evaluated per-call, so it stays correct even if a
 * caller forgets to pass one explicitly, or if the symbol changes after
 * settingsStore.load() resolves. Pass a symbol explicitly only when you
 * genuinely need to override the store's currency for that one value.
 */
export function formatMoney(amount, symbol = settingsStore.getCurrencySymbol()) {
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
