// assets/js/ui/back-to-pos-button.js
// A single, unambiguous way back to the POS home screen from any other
// full-page view (Settings, Transactions). Hash-based navigation, so
// this doesn't need a router reference -- setting the hash is enough
// to trigger core/router.js's hashchange listener.

import { el } from '../shared/utils.js';

export function createBackToPosButton() {
  return el('button', {
    class: 'btn btn-secondary btn-back-pos',
    onClick: () => { window.location.hash = 'pos'; }
  }, '\u2190 Point of Sale');
}
