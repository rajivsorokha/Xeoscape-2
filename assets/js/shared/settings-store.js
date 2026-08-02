// assets/js/shared/settings-store.js
// Small in-memory cache for the store profile (currency symbol, tax
// rate, etc.) so UI modules can format money consistently without each
// one re-fetching /api/settings/profile.

import apiClient from './api-client.js';

const state = {
  currencySymbol: '$',
  taxPercentage: 0,
  chargeTax: false,
  storeName: 'My Store',
  receiptFooter: ''
};

let loaded = false;

async function load() {
  try {
    const profile = await apiClient.get('/settings/profile');
    Object.assign(state, profile);
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

export default { load, getCurrencySymbol, getProfile, isLoaded: () => loaded };
