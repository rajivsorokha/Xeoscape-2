// assets/js/modules/settings/whatsapp-reminders.js
// "WhatsApp Reminders" settings section: configure Twilio's WhatsApp
// API and send due/outstanding-balance reminders to customers, either
// to a single customer, a hand-picked selection, or everyone with a
// balance at once. B2B General Retail only -- due/credit payment
// itself is B2B-only (see core/transaction-manager.js), so reminders
// about it are too.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import notification from '../../ui/notification.js';

export async function mountWhatsAppReminders(container) {
  container.appendChild(el('h3', {}, 'WhatsApp Reminders'));

  if (!settingsStore.isB2B()) {
    container.appendChild(el('p', { class: 'settings-hint' },
      'WhatsApp due/outstanding reminders are only available for B2B General Retail (they remind customers about the due/outstanding balances that store type supports). ' +
      'Switch Store Type to B2B General Retail in Settings \u2192 Store Type to use this.'
    ));
    return;
  }

  container.appendChild(el('p', { class: 'settings-hint' },
    'Sends a WhatsApp message via Twilio reminding a customer about their outstanding balance. ' +
    'Important: WhatsApp requires business-initiated messages to use a pre-approved Message Template, not free text ' +
    '(see twilio.com/docs/whatsapp/api) -- without a Template SID below, sending only works in Twilio\u2019s WhatsApp Sandbox for testing, not for real unprompted reminders.'
  ));

  const symbol = settingsStore.getCurrencySymbol();
  const settings = await apiClient.get('/whatsapp/settings');
  const values = { ...settings, authToken: '' };

  const field = (key, label, opts = {}) => {
    const input = el('input', {
      type: opts.type || 'text',
      value: values[key] ?? '',
      placeholder: opts.placeholder || '',
      onInput: (e) => { values[key] = e.target.value; }
    });
    return el('div', { class: 'form-field' }, [el('label', {}, label), input]);
  };

  const enabledCheckbox = el('input', { type: 'checkbox', checked: Boolean(values.enabled), onChange: (e) => { values.enabled = e.target.checked; } });

  const authTokenInput = el('input', {
    type: 'password',
    value: '',
    placeholder: settings.authTokenSet ? '(unchanged \u2014 leave blank to keep)' : 'Twilio Auth Token',
    onInput: (e) => { values.authToken = e.target.value; }
  });

  const templateInput = el('textarea', {
    rows: '3',
    onInput: (e) => { values.reminderMessage = e.target.value; }
  }, values.reminderMessage || '');

  container.appendChild(el('div', { class: 'settings-section' }, [
    el('h4', {}, 'Twilio Connection'),
    el('div', { class: 'form-field' }, [el('label', { class: 'perm-checkbox' }, [enabledCheckbox, ' Enable WhatsApp reminders'])]),
    field('accountSid', 'Account SID', { placeholder: 'AC...' }),
    el('div', { class: 'form-field' }, [el('label', {}, 'Auth Token'), authTokenInput]),
    field('fromNumber', 'From Number', { placeholder: 'whatsapp:+14155238886' }),
    field('contentSid', 'Message Template SID (recommended for production)', { placeholder: 'HX... (optional)' })
  ]));

  container.appendChild(el('div', { class: 'settings-section' }, [
    el('h4', {}, 'Reminder Message'),
    el('p', { class: 'settings-hint' }, 'Used only when no Template SID is set above. Placeholders: {{name}}, {{amount}}.'),
    templateInput
  ]));

  container.appendChild(el('div', { style: 'display:flex; gap:0.5rem; flex-wrap:wrap;' }, [
    el('button', {
      class: 'btn btn-primary',
      onClick: async () => {
        try {
          const updated = await apiClient.put('/whatsapp/settings', values);
          Object.assign(settings, updated);
          values.authToken = '';
          authTokenInput.placeholder = updated.authTokenSet ? '(unchanged \u2014 leave blank to keep)' : 'Twilio Auth Token';
          notification.success('WhatsApp settings saved.');
        } catch (err) {
          notification.error(err.message);
        }
      }
    }, 'Save Settings')
  ]));

  // --- Send Reminders: single / selective / bulk ---
  // Backed by the same two endpoints either way -- POST
  // /whatsapp/send-reminder/:customerId for one customer at a time
  // (used for the single-row button and, looped, for a hand-picked
  // selection) and POST /whatsapp/send-reminders-bulk for everyone
  // with a balance in one call (see api/whatsapp.js).
  container.appendChild(el('h3', { style: 'margin-top:1.5rem;' }, 'Send Reminders'));

  const selected = new Set();
  let customers = [];

  const selectionSummary = el('span', { class: 'settings-hint' }, '');
  const sendSelectedBtn = el('button', {
    class: 'btn btn-primary btn-sm',
    disabled: true,
    onClick: () => sendTo([...selected])
  }, 'Send to Selected');
  const sendAllBtn = el('button', {
    class: 'btn btn-secondary btn-sm',
    onClick: sendToAll
  }, 'Send to All Customers with a Balance');
  const statusLine = el('p', { class: 'settings-hint' }, '');
  const actionRow = el('div', { class: 'perf-filter-row', style: 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;' });
  const tableWrap = el('div', { class: 'table-container' });

  container.appendChild(actionRow);
  container.appendChild(tableWrap);
  container.appendChild(statusLine);

  function renderActionRow() {
    actionRow.innerHTML = '';
    selectionSummary.textContent = selected.size
      ? `${selected.size} customer(s) selected`
      : `${customers.length} customer(s) with a balance`;
    sendSelectedBtn.disabled = selected.size === 0;
    actionRow.appendChild(selectionSummary);
    actionRow.appendChild(el('div', { style: 'display:flex; gap:0.5rem;' }, [sendSelectedBtn, sendAllBtn]));
  }

  function toggleAll(checked) {
    customers.forEach((c) => (checked ? selected.add(c.id) : selected.delete(c.id)));
    renderTable();
    renderActionRow();
  }

  function renderTable() {
    tableWrap.innerHTML = '';
    if (!customers.length) {
      tableWrap.appendChild(el('div', { class: 'table-empty' }, 'No customer currently has an outstanding balance. \u2705'));
      return;
    }

    const selectAll = el('input', {
      type: 'checkbox',
      checked: customers.length > 0 && selected.size === customers.length,
      onChange: (e) => toggleAll(e.target.checked)
    });

    const thead = el('thead', {}, [
      el('tr', {}, [
        el('th', {}, [selectAll]),
        el('th', {}, 'Name'),
        el('th', {}, 'Phone'),
        el('th', {}, 'Due / Outstanding'),
        el('th', {}, 'Remind')
      ])
    ]);

    const rows = customers.map((c) => {
      const checkbox = el('input', {
        type: 'checkbox',
        checked: selected.has(c.id),
        onChange: (e) => {
          if (e.target.checked) selected.add(c.id); else selected.delete(c.id);
          renderActionRow();
        }
      });
      const remindBtn = el('button', {
        class: 'btn btn-sm btn-secondary',
        type: 'button',
        onClick: () => sendTo([c.id])
      }, '\u{1F4F1} Remind');

      return el('tr', {}, [
        el('td', {}, [checkbox]),
        el('td', {}, c.name || '\u2014'),
        el('td', {}, c.phone || '\u2014'),
        el('td', {}, el('span', { style: 'color:var(--color-danger); font-weight:600;' }, formatMoney(c.balance, symbol))),
        el('td', {}, [remindBtn])
      ]);
    });

    tableWrap.appendChild(el('table', { class: 'app-table perf-table' }, [thead, el('tbody', {}, rows)]));
  }

  async function loadCustomers() {
    try {
      const report = await apiClient.get('/transactions/reports/outstanding-credit');
      customers = report.customers || [];
      renderTable();
      renderActionRow();
    } catch (err) {
      notification.error(`Failed to load customers with a balance: ${err.message}`);
    }
  }

  // Sends to one or more specific customers -- a single-row "Remind"
  // click passes a one-element array, "Send to Selected" passes the
  // whole selection. Looped client-side (there's no bulk-by-id
  // endpoint), but reported back the same way the bulk-all endpoint
  // reports its results, so the messaging is consistent either way.
  async function sendTo(customerIds) {
    if (!customerIds.length) return;
    sendSelectedBtn.disabled = true;
    sendAllBtn.disabled = true;
    statusLine.textContent = customerIds.length === 1 ? 'Sending\u2026' : `Sending 0 of ${customerIds.length}\u2026`;
    let sent = 0;
    const failed = [];
    for (const id of customerIds) {
      try {
        await apiClient.post(`/whatsapp/send-reminder/${id}`, {});
        sent += 1;
      } catch (err) {
        const customer = customers.find((c) => c.id === id);
        failed.push({ name: customer?.name || id, error: err.message });
      }
      if (customerIds.length > 1) statusLine.textContent = `Sending ${sent + failed.length} of ${customerIds.length}\u2026`;
    }
    statusLine.textContent = `Sent ${sent} of ${customerIds.length} reminder(s).`;
    if (failed.length) {
      notification.warning(`${failed.length} reminder(s) failed: ${failed.map((f) => f.name).join(', ')}.`);
    } else {
      notification.success(`Sent ${sent} reminder(s).`);
    }
    selected.clear();
    renderTable();
    renderActionRow();
    sendSelectedBtn.disabled = selected.size === 0;
    sendAllBtn.disabled = false;
  }

  async function sendToAll() {
    sendSelectedBtn.disabled = true;
    sendAllBtn.disabled = true;
    statusLine.textContent = 'Sending\u2026';
    try {
      const result = await apiClient.post('/whatsapp/send-reminders-bulk', {});
      statusLine.textContent = `Sent ${result.sent} of ${result.total} reminder(s).`;
      const failed = result.results.filter((r) => !r.sent);
      if (failed.length) {
        notification.warning(`${failed.length} reminder(s) failed \u2014 see the list above.`);
      } else if (result.total > 0) {
        notification.success(`Sent ${result.sent} reminder(s).`);
      } else {
        notification.warning('No customers currently have an outstanding balance.');
      }
    } catch (err) {
      statusLine.textContent = '';
      notification.error(err.message);
    } finally {
      sendAllBtn.disabled = false;
      sendSelectedBtn.disabled = selected.size === 0;
    }
  }

  await loadCustomers();
}
