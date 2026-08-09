// assets/js/modules/settings/whatsapp-reminders.js
// "WhatsApp Reminders" settings section: configure Twilio's WhatsApp
// API and send credit/due-balance reminders to customers. B2B General
// Retail only -- due/credit payment itself is B2B-only (see
// core/transaction-manager.js), so reminders about it are too.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import settingsStore from '../../shared/settings-store.js';
import notification from '../../ui/notification.js';

export async function mountWhatsAppReminders(container) {
  container.appendChild(el('h3', {}, 'WhatsApp Reminders'));

  if (!settingsStore.isB2B()) {
    container.appendChild(el('p', { class: 'settings-hint' },
      'WhatsApp credit reminders are only available for B2B General Retail (they remind customers about the credit/due balances that store type supports). ' +
      'Switch Store Type to B2B General Retail in Settings \u2192 Store Type to use this.'
    ));
    return;
  }

  container.appendChild(el('p', { class: 'settings-hint' },
    'Sends a WhatsApp message via Twilio reminding a customer about their outstanding balance. ' +
    'Important: WhatsApp requires business-initiated messages to use a pre-approved Message Template, not free text ' +
    '(see twilio.com/docs/whatsapp/api) -- without a Template SID below, sending only works in Twilio\u2019s WhatsApp Sandbox for testing, not for real unprompted reminders.'
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
    el('button', {
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
    }, 'Send Reminders to All Customers with a Balance')
  ]));
  container.appendChild(bulkStatus);
}
