// assets/js/core/activation-gate.js
// Full-screen activation gate shown before anything else if the app
// hasn't been activated yet. The person picks their store type from a
// live dropdown (sourced from /api/settings/store-types, so it never
// goes stale as new store types are added) and enters the matching
// activation key. Entering a valid key both unlocks the app and sets
// the active store type to match -- except a demo key, which isn't
// tied to one store type, so it unlocks as whichever type is
// currently selected in the dropdown (see core/activation.js#activate).

import apiClient from '../shared/api-client.js';
import { el } from '../shared/utils.js';

/**
 * @returns {Promise<void>} resolves once activation succeeds
 */
export function renderActivationGate(rootEl) {
  return new Promise((resolve) => {
    let key = '';
    let storeTypes = [];

    const errorEl = el('div', { class: 'gate-error' }, '');

    const typeSelect = el('select', { class: 'gate-input gate-select' }, [
      el('option', { value: '', disabled: true, selected: true }, 'Select your store type\u2026')
    ]);

    const typeDescEl = el('p', { class: 'gate-hint gate-type-desc' }, '');

    const keyInput = el('input', {
      type: 'text',
      class: 'gate-input',
      placeholder: 'Enter your activation key',
      onInput: (e) => { key = e.target.value; }
    });

    const submitBtn = el('button', { class: 'btn btn-primary btn-block', onClick: submit }, 'Activate');

    function updateTypeDescription() {
      const current = storeTypes.find((st) => st.id === typeSelect.value);
      typeDescEl.textContent = current ? current.description : '';
    }
    typeSelect.addEventListener('change', () => {
      errorEl.textContent = '';
      updateTypeDescription();
    });

    async function submit() {
      if (!typeSelect.value) {
        errorEl.textContent = 'Please select your store type.';
        return;
      }
      if (!key.trim()) {
        errorEl.textContent = 'Please enter an activation key.';
        return;
      }
      errorEl.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Activating...';
      try {
        const result = await apiClient.post('/activation/activate', { activationKey: key, storeType: typeSelect.value });
        // A demo key isn't tied to one store type -- it activates as
        // whatever was selected, so there's nothing to reconcile. A
        // real key's store type comes from the key itself, so check it
        // still matches what was picked.
        if (!result.isDemo && result.storeType !== typeSelect.value) {
          // The key is valid, but for a different store type -- undo the
          // activation rather than silently switching the selection out
          // from under the person.
          await apiClient.post('/activation/deactivate');
          const matched = storeTypes.find((st) => st.id === result.storeType);
          const selected = storeTypes.find((st) => st.id === typeSelect.value);
          throw new Error(
            `That key is for "${matched ? matched.label : result.storeType}", not "${selected ? selected.label : typeSelect.value}". `
            + 'Pick the matching store type, or enter the correct key.'
          );
        }
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
        el('div', { class: 'gate-badge' }, 'X'),
        el('h1', { class: 'gate-title' }, 'Xeoscape'),
        el('p', { class: 'gate-subtitle' }, 'Activate this installation to get started.'),
        el('label', { class: 'gate-label' }, 'Store Type'),
        typeSelect,
        typeDescEl,
        el('label', { class: 'gate-label' }, 'Activation Key'),
        keyInput,
        el('p', { class: 'gate-hint' }, 'Just trying it out? A demo key works with any store type above.'),
        errorEl,
        submitBtn
      ])
    ]));

    // Populate the store type dropdown from the live config so this
    // list can never drift out of sync with config/store-types.json.
    apiClient.get('/settings/store-types')
      .then((types) => {
        storeTypes = types;
        types.forEach((st) => {
          typeSelect.appendChild(el('option', { value: st.id }, st.label));
        });
      })
      .catch(() => {
        errorEl.textContent = 'Could not load store types. Check your connection and reload.';
      });

    keyInput.focus();
  });
}
