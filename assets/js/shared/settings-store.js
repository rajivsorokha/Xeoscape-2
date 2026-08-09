// assets/js/shared/settings-store.js
// Small in-memory cache for the store profile (currency symbol, tax
// rate, etc.) and the active store type id, so UI modules can format
// money consistently and check "is this B2B" without each one
// re-fetching /api/settings/profile or /api/settings.

import apiClient from './api-client.js';

const state = {
  currencySymbol: '$',
  taxPercentage: 0,
  chargeTax: false,
  storeName: 'My Store',
  receiptFooter: '',
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
 * Whether the active store type is B2B General Retail -- gates
 * credit/due-payment UI (see assets/js/modules/checkout/payment.js
 * and core/transaction-manager.js#checkout, which enforces the same
 * restriction server-side so this isn't just a client-side toggle).
 */
function isB2B() {
  return state.storeTypeId === 'b2bGeneralRetail';
}

export default { load, getCurrencySymbol, getProfile, isB2B, isLoaded: () => loaded };
