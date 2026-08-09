// assets/js/modules/products/quick-scan-add.js
// "Quick Scan Add": scan a barcode with any USB/Bluetooth scanner
// (they act as a keyboard, typing the code + Enter into whatever's
// focused -- no special driver/integration needed). If the barcode
// matches a product already in the catalog, jumps straight to editing
// it (e.g. to bump stock). If it's new, tries an external barcode
// lookup to auto-fill the name, then opens the New Product form with
// the SKU (and name, if found) pre-filled -- after Save or Cancel,
// focus returns to the scan input automatically so the next scan is
// immediately ready, without navigating back through any menus.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { openProductForm } from './product-form.js';
import notification from '../../ui/notification.js';

export async function mountQuickScanAdd(container) {
  container.appendChild(el('h3', {}, 'Quick Scan Add'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'Scan a barcode with a USB/Bluetooth scanner (it types the code + Enter automatically, just like a keyboard) or type one and press Enter. ' +
    'Existing products jump straight to editing; new ones try to auto-fill the name from an external barcode lookup, then open ready to save.'
  ));

  const scanInput = el('input', {
    type: 'text',
    class: 'search-input',
    placeholder: 'Scan or type a barcode, then press Enter\u2026',
    autofocus: true,
    style: 'font-size:1.1rem; padding:0.75rem;'
  });
  const statusLine = el('p', { class: 'settings-hint', style: 'min-height:1.2em;' }, '');
  const sessionLog = el('div', { class: 'table-container' });
  const sessionRows = [];

  container.appendChild(el('div', { class: 'form-field' }, [scanInput]));
  container.appendChild(statusLine);
  container.appendChild(el('h4', {}, 'This Session'));
  container.appendChild(sessionLog);
  renderSessionLog();

  function refocus() {
    // A short delay lets the modal fully close first -- focusing
    // immediately can race the modal's own teardown.
    setTimeout(() => scanInput.focus(), 50);
  }

  function renderSessionLog() {
    sessionLog.innerHTML = '';
    if (!sessionRows.length) {
      sessionLog.appendChild(el('div', { class: 'table-empty' }, 'Nothing scanned yet this session.'));
      return;
    }
    const thead = el('thead', {}, [el('tr', {}, ['Barcode', 'Result'].map((h) => el('th', {}, h)))]);
    const rows = sessionRows.slice().reverse().map((r) => el('tr', {}, [
      el('td', {}, r.code),
      el('td', {}, r.result)
    ]));
    sessionLog.appendChild(el('table', { class: 'app-table' }, [thead, el('tbody', {}, rows)]));
  }

  scanInput.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const code = scanInput.value.trim();
    if (!code) return;
    scanInput.value = '';
    scanInput.disabled = true;
    statusLine.textContent = `Checking ${code}\u2026`;

    try {
      // 1. Already in the catalog? Jump straight to editing it.
      const matches = await apiClient.get(`/inventory/products?search=${encodeURIComponent(code)}`);
      const exact = matches.find((p) => p.sku === code);
      if (exact) {
        statusLine.textContent = `Found existing product: ${exact.name}`;
        sessionRows.push({ code, result: `Existing: ${exact.name}` });
        renderSessionLog();
        openProductForm({ product: exact, onClose: () => { scanInput.disabled = false; refocus(); } });
        return;
      }

      // 2. New barcode -- try to auto-fill the name via external lookup.
      statusLine.textContent = `New barcode. Looking up ${code}\u2026`;
      let lookup = { found: false };
      try {
        lookup = await apiClient.get(`/inventory/barcode-lookup/${encodeURIComponent(code)}`);
      } catch (err) {
        // Lookup failing shouldn't block manual entry -- fall through with found:false.
      }

      const initialValues = { sku: code };
      if (lookup.found) {
        if (lookup.name) initialValues.name = lookup.brand ? `${lookup.brand} ${lookup.name}` : lookup.name;
        if (lookup.imageUrl) initialValues.imageUrl = lookup.imageUrl;
      }

      statusLine.textContent = lookup.found
        ? `New product -- name auto-filled from barcode lookup. Fill in the rest and save.`
        : `New product -- no external match found (${lookup.reason || 'not in the barcode database'}). Enter the details manually.`;
      sessionRows.push({ code, result: lookup.found ? `New: ${initialValues.name}` : 'New: entered manually' });
      renderSessionLog();

      openProductForm({
        initialValues,
        onSaved: () => { statusLine.textContent = `Saved. Ready for the next scan.`; },
        onClose: () => { scanInput.disabled = false; refocus(); }
      });
    } catch (err) {
      notification.error(err.message);
      scanInput.disabled = false;
      refocus();
    }
  });

  refocus();
}
