// assets/js/modules/settings/tally-integration.js
// "Tally Integration" settings section: configure and run syncing of
// daily sales, tax breakdowns, and payment collection details to
// Tally (Prime/ERP9) via its XML import gateway.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import notification from '../../ui/notification.js';

export async function mountTallyIntegration(container) {
  container.appendChild(el('h3', {}, 'Tally Integration'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'Syncs daily sales vouchers (itemized, with GST split into CGST/SGST/IGST ledgers) and payment collection details to Tally via its XML import gateway. ' +
    'Requires Tally running on this same machine/network with its XML/HTTP gateway enabled (in Tally: F12 \u2192 Advanced Configuration \u2192 enable the ODBC/HTTP server, default port 9000).'
  ));

  const settings = await apiClient.get('/tally/settings');
  const values = { ...settings };

  const field = (key, label, opts = {}) => {
    const input = el('input', {
      type: opts.type || 'text',
      value: values[key] ?? '',
      placeholder: opts.placeholder || '',
      onInput: (e) => { values[key] = opts.type === 'number' ? Number(e.target.value) : e.target.value; }
    });
    return el('div', { class: 'form-field' }, [el('label', {}, label), input]);
  };

  const enabledCheckbox = el('input', { type: 'checkbox', checked: Boolean(values.enabled), onChange: (e) => { values.enabled = e.target.checked; } });
  const autoSyncCheckbox = el('input', { type: 'checkbox', checked: Boolean(values.autoSyncEnabled), onChange: (e) => { values.autoSyncEnabled = e.target.checked; } });
  const gstTypeSelect = el('select', { onChange: (e) => { values.gstType = e.target.value; } }, [
    el('option', { value: 'intrastate' }, 'Intrastate (splits into CGST + SGST)'),
    el('option', { value: 'interstate' }, 'Interstate (full amount into IGST)')
  ]);
  gstTypeSelect.value = values.gstType || 'intrastate';

  container.appendChild(el('div', { class: 'settings-section' }, [
    el('h4', {}, 'Connection'),
    el('div', { class: 'form-field' }, [el('label', { class: 'perm-checkbox' }, [enabledCheckbox, ' Enable Tally sync'])]),
    field('companyName', 'Tally Company Name *', { placeholder: 'Must exactly match the company loaded in Tally' }),
    el('div', { style: 'display:grid; grid-template-columns: 2fr 1fr; gap:0.75rem;' }, [
      field('host', 'Host', { placeholder: 'localhost' }),
      field('port', 'Port', { type: 'number', placeholder: '9000' })
    ])
  ]));

  container.appendChild(el('div', { class: 'settings-section' }, [
    el('h4', {}, 'Ledger Mapping'),
    el('p', { class: 'settings-hint' }, 'Ledger names must already exist in Tally exactly as typed here (or be set up to auto-create).'),
    field('salesLedgerName', 'Sales Ledger'),
    el('div', { class: 'form-field' }, [el('label', {}, 'GST Type'), gstTypeSelect]),
    el('div', { style: 'display:grid; grid-template-columns: repeat(3, 1fr); gap:0.75rem;' }, [
      field('cgstLedgerName', 'CGST Ledger'),
      field('sgstLedgerName', 'SGST Ledger'),
      field('igstLedgerName', 'IGST Ledger')
    ]),
    el('div', { style: 'display:grid; grid-template-columns: repeat(2, 1fr); gap:0.75rem;' }, [
      field('cashLedgerName', 'Cash Payments Ledger'),
      field('cardLedgerName', 'Card Payments Ledger')
    ])
  ]));

  const statusText = el('p', { class: 'settings-hint' },
    settings.lastSyncAt
      ? `Last sync: ${new Date(settings.lastSyncAt).toLocaleString()} \u2014 ${settings.lastSyncStatus === 'success' ? '\u2705' : '\u26A0\uFE0F'} ${settings.lastSyncMessage || ''}`
      : 'Never synced yet.'
  );

  const testBtn = el('button', {
    class: 'btn btn-secondary',
    onClick: async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing\u2026';
      try {
        await saveSettings(false);
        const result = await apiClient.post('/tally/test-connection', {});
        notification.success(result.message);
      } catch (err) {
        notification.error(err.message);
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Test Connection';
      }
    }
  }, 'Test Connection');

  const syncBtn = el('button', {
    class: 'btn btn-primary',
    onClick: async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing\u2026';
      try {
        await saveSettings(false);
        const result = await apiClient.post('/tally/sync', {});
        notification.success(result.message);
        statusText.textContent = `Last sync: ${new Date().toLocaleString()} \u2014 \u2705 ${result.message}`;
      } catch (err) {
        notification.error(err.message);
        statusText.textContent = `Last sync failed: ${err.message}`;
      } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync Today\u2019s Sales Now';
      }
    }
  }, 'Sync Today\u2019s Sales Now');

  const exportBtn = el('button', {
    class: 'btn btn-secondary',
    onClick: async () => {
      try {
        await apiClient.downloadFile('/tally/export', `tally-export-${new Date().toISOString().slice(0, 10)}.xml`);
      } catch (err) {
        notification.error(err.message);
      }
    }
  }, 'Download XML Instead');

  container.appendChild(el('div', { class: 'settings-section' }, [
    el('h4', {}, 'Sync'),
    el('div', { class: 'form-field' }, [el('label', { class: 'perm-checkbox' }, [autoSyncCheckbox, ' Auto-sync daily'])]),
    field('autoSyncTime', 'Auto-sync time (24h)', { placeholder: '23:30' }),
    statusText,
    el('div', { style: 'display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;' }, [testBtn, syncBtn, exportBtn]),
    el('p', { class: 'settings-hint' },
      'If direct sync can\u2019t reach Tally (different machine, gateway not enabled), use "Download XML Instead" and import it manually in Tally via Import Data \u2192 Vouchers.'
    )
  ]));

  async function saveSettings(notify = true) {
    const updated = await apiClient.put('/tally/settings', values);
    Object.assign(settings, updated);
    if (notify) notification.success('Tally settings saved.');
  }

  container.appendChild(el('button', { class: 'btn btn-primary', onClick: () => saveSettings(true) }, 'Save Tally Settings'));
}
