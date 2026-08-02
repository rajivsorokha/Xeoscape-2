// assets/js/modules/checkout/keypad.js
// On-screen numeric keypad, useful for touch-screen POS terminals when
// entering quantities, cash tendered, or manual price overrides.

import { el } from '../../shared/utils.js';

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'C'];

export function mountKeypad(container, { onChange }) {
  let value = '';

  const display = el('div', { class: 'keypad-display' }, '0');

  function update(next) {
    value = next;
    display.textContent = value || '0';
    onChange?.(value);
  }

  const keys = KEYS.map((key) =>
    el('button', {
      class: 'keypad-key',
      onClick: () => {
        if (key === 'C') {
          update('');
        } else if (key === '.' && value.includes('.')) {
          // ignore duplicate decimal point
        } else {
          update(value + key);
        }
      }
    }, key)
  );

  container.appendChild(el('div', { class: 'keypad' }, [display, el('div', { class: 'keypad-grid' }, keys)]));
}
