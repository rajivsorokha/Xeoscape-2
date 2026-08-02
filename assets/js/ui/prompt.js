// assets/js/ui/prompt.js
// Custom in-app replacement for window.prompt(), which Electron's
// renderer process does not implement (it silently returns null with
// no dialog shown at all -- a well-known Electron limitation). This
// uses our own modal system instead, so it works reliably both in the
// Electron app and in a regular browser.

import { el } from '../shared/utils.js';
import modalManager from './modal-manager.js';

/**
 * @param {string} message - label shown above the input
 * @param {string} [defaultValue] - pre-filled value
 * @returns {Promise<string|null>} the entered value, or null if cancelled
 */
export function promptModal(message, defaultValue = '') {
  return new Promise((resolve) => {
    let value = defaultValue;
    let resolved = false;

    const input = el('input', {
      type: 'text',
      value: defaultValue,
      onInput: (e) => { value = e.target.value; }
    });

    const form = el('div', {}, [
      el('div', { class: 'form-field' }, [el('label', {}, message), input])
    ]);

    modalManager.open({
      title: 'Input Required',
      content: form,
      actions: [
        {
          label: 'Cancel',
          className: 'btn-secondary',
          onClick: () => { resolved = true; resolve(null); }
        },
        {
          label: 'OK',
          className: 'btn-primary',
          onClick: () => { resolved = true; resolve(value); }
        }
      ]
    });

    // Focus the input and let Enter submit, matching native prompt() feel.
    setTimeout(() => {
      input.focus();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !resolved) {
          resolved = true;
          modalManager.close();
          resolve(value);
        }
      });
    }, 0);
  });
}
