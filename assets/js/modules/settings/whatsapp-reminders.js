// assets/js/modules/settings/whatsapp-reminders.js
// "WhatsApp" settings section: configure Twilio's WhatsApp API. That
// one connection powers (a) sending bills/receipts straight from the
// POS screen and (b) credit/due-balance reminders. The connection is
// always configurable; the reminder part only shows when credit sales
// are switched on (see core/transaction-manager.js).

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import settingsStore from '../../shared/settings-store.js';
import notification from '../../ui/notification.js';

export async function mountWhatsAppReminders(container) {
  container.appendChild(el('h3', {}, 'WhatsApp'));

  container.appendChild(el('p', { class: 'settings-hint' },
    'Connects the app to WhatsApp (via Twilio) so the WhatsApp button on the POS screen and receipt sends the bill directly ' +
    'from the app, without opening WhatsApp. Until this is set up and enabled, that button falls back to opening WhatsApp. ' +
    'Note: WhatsApp requires business-initiated messages to use a pre-approved Message Template ' +
    '(see twilio.com/docs/whatsapp/api) -- without Template SIDs below, sending only works in Twilio\u2019s WhatsApp Sandbox for testing, ' +
    'or within 24 hours of the customer messaging your number first.'
  ));

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
    el('div', { class: 'form-field' }, [el('label', { class: 'perm-checkbox' }, [enabledCheckbox, ' Enable sending from the app (bills and reminders)'])]),
    field('accountSid', 'Account SID', { placeholder: 'AC...' }),
    el('div', { class: 'form-field' }, [el('label', {}, 'Auth Token'), authTokenInput]),
    field('fromNumber', 'From Number', { placeholder: 'whatsapp:+14155238886' }),
    field('defaultCountryCode', 'Default country code (added to 10-digit numbers)', { placeholder: '91' }),
    field('billContentSid', 'Bill Template SID (optional; variables: 1 = customer name, 2 = store name, 3 = total)', { placeholder: 'HX... (optional)' }),
    field('contentSid', 'Reminder Template SID (optional; variables: 1 = name, 2 = amount)', { placeholder: 'HX... (optional)' })
  ]));

  const creditOn = settingsStore.isCreditEnabled();

  if (creditOn) {
    container.appendChild(el('div', { class: 'settings-section' }, [
      el('h4', {}, 'Reminder Message'),
      el('p', { class: 'settings-hint' }, 'Used only when no Reminder Template SID is set above. Placeholders: {{name}}, {{amount}}.'),
      templateInput
    ]));
  } else {
    container.appendChild(el('p', { class: 'settings-hint' },
      'Payment reminders for outstanding balances are also available once you tick \u201CAllow credit / due sales\u201D in Settings \u2192 Store Profile.'
    ));
  }

  const bulkStatus = el('p', { class: 'settings-hint' }, '');

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
    }, 'Save Settings'),
    creditOn ? el('button', {
      class: 'btn btn-secondary',
      onClick: async (e) => {
        e.target.disabled = true;
        bulkStatus.textContent = 'Sending\u2026';
        try {
          const result = await apiClient.post('/whatsapp/send-reminders-bulk', {});
          bulkStatus.textContent = `Sent ${result.sent} of ${result.total} reminder(s).`;
          const failed = result.results.filter((r) => !r.sent);
          if (failed.length) {
            notification.warning(`${failed.length} reminder(s) failed \u2014 see the list below.`);
          } else if (result.total > 0) {
            notification.success(`Sent ${result.sent} reminder(s).`);
          } else {
            notification.warning('No customers currently have an outstanding balance.');
          }
        } catch (err) {
          bulkStatus.textContent = '';
          notification.error(err.message);
        } finally {
          e.target.disabled = false;
        }
      }
    }, 'Send Reminders to All Customers with a Balance') : null
  ]));
  container.appendChild(bulkStatus);
}
