// assets/js/core/activation-gate.js
// Full-screen activation gate shown before anything else if the app
// hasn't been activated yet. Entering a valid per-store-type key both
// unlocks the app and sets the active store type to match.

import apiClient from '../shared/api-client.js';
import { el } from '../shared/utils.js';

const STORE_TYPE_HINTS = [
  'General Retail', 'Pharmacy', 'Grocery / Supermarket',
  'Apparel / Fashion', 'Electronics', 'Restaurant / Cafe',
  'B2B General Retails', 'Hardware / Home Improvement',
  'Beauty / Cosmetics', 'Furniture / Home Decor',
  'Books / Stationery / Office Supplies', 'Sports / Outdoors',
  'Jewelry / Accessories', 'Auto Parts / Automotive',
  'Pet Supplies', 'Convenience Store', 'Liquor / Wine Store',
  'Flowers / Gifts', 'Toys / Games'
];

/**
 * @returns {Promise<void>} resolves once activation succeeds
 */
export function renderActivationGate(rootEl) {
  return new Promise((resolve) => {
    let key = '';
    const errorEl = el('div', { class: 'gate-error' }, '');

    const keyInput = el('input', {
      type: 'text',
      class: 'gate-input',
      placeholder: 'Enter your activation key',
      onInput: (e) => { key = e.target.value; }
    });

    const submitBtn = el('button', { class: 'btn btn-primary btn-block', onClick: submit }, 'Activate');

    async function submit() {
      if (!key.trim()) {
        errorEl.textContent = 'Please enter an activation key.';
        return;
      }
      errorEl.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Activating...';
      try {
        await apiClient.post('/activation/activate', { activationKey: key });
        resolve();
      } catch (err) {
        errorEl.textContent = err.message;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Activate';
      }
    }

    keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

    rootEl.innerHTML = '';
    rootEl.appendChild(el('div', { class: 'gate-screen' }, [
      el('div', { class: 'gate-card' }, [
        el('h1', { class: 'gate-title' }, 'Xeoscape'),
        el('p', { class: 'gate-subtitle' }, 'Activate this installation to get started.'),
        el('p', { class: 'gate-hint' }, `Licensed for: ${STORE_TYPE_HINTS.join(', ')}`),
        keyInput,
        errorEl,
        submitBtn
      ])
    ]));

    keyInput.focus();
  });
}
