// assets/js/shared/settings-store.js
// Small in-memory cache for the store profile (currency symbol, tax
// rate, credit-sales flag, etc.) and the active store type id, so UI
// modules can format money consistently and check store-wide toggles
// without each one re-fetching /api/settings/profile or /api/settings.

import apiClient from './api-client.js';

const state = {
  currencySymbol: '$',
  taxPercentage: 0,
  chargeTax: false,
  storeName: 'My Store',
  receiptFooter: '',
  creditSalesEnabled: false,
  storeTypeId: null
};

let loaded = false;

async function load() {
  try {
    const [profile, settings] = await Promise.all([
      apiClient.get('/settings/profile'),
      apiClient.get('/settings')
    ]);
    Object.assign(state, profile);
    state.storeTypeId = settings.storeType?.id || null;
    loaded = true;
  } catch (err) {
    console.warn('Could not load store profile, using defaults', err);
  }
  return state;
}

function getCurrencySymbol() {
  return state.currencySymbol;
}

function getProfile() {
  return state;
}

/**
 * Whether this store allows a sale to be left partly unpaid against a
 * customer's balance. Gates the Credit payment tab, the Due /
 * Outstanding report, and WhatsApp payment reminders. Previously this
 * was inferred from the B2B General Retail store type; this build is
 * the Apparel / Fashion edition only, so it's now an explicit store
 * setting (Settings -> Store Profile). core/transaction-manager.js
 * enforces the same rule server-side, so this isn't only a
 * client-side toggle.
 */
function isCreditEnabled() {
  return Boolean(state.creditSalesEnabled);
}

export default { load, getCurrencySymbol, getProfile, isCreditEnabled, isLoaded: () => loaded };
