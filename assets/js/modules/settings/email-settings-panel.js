// assets/js/modules/settings/email-settings-panel.js
// "Send via Email" section: SMTP configuration and scheduled automated
// report emails. Report generation itself lives in the separate
// "Report Generator" section (report-generator-settings.js).

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import notification from '../../ui/notification.js';

export async function mountEmailSettings(container) {
  container.appendChild(el('h3', {}, 'Send via Email'));
  container.appendChild(el('p', { class: 'settings-hint' }, 'Configure the outgoing mail server and, optionally, an automatic sending schedule.'));

  const emailSettings = await apiClient.get('/settings/email');
  const values = { ...emailSettings, smtpPass: '' };

  function textField(key, label, placeholder = '', type = 'text') {
    const input = el('input', {
      type,
      value: values[key] ?? '',
      placeholder,
      onInput: (e) => { values[key] = e.target.value; }
    });
    return el('div', { class: 'form-field' }, [el('label', {}, label), input]);
  }

  function checkboxField(key, label) {
    const checkbox = el('input', {
      type: 'checkbox',
      checked: Boolean(values[key]),
      onChange: (e) => { values[key] = e.target.checked; }
    });
    return el('div', { class: 'form-field' }, [el('label', { class: 'perm-checkbox' }, [checkbox, ` ${label}`])]);
  }

  const frequencySelect = el('select', {
    onChange: (e) => { values.scheduleFrequency = e.target.value; }
  }, ['daily', 'weekly', 'monthly'].map((f) => el('option', { value: f }, f.charAt(0).toUpperCase() + f.slice(1))));
  frequencySelect.value = values.scheduleFrequency || 'daily';

  const emailForm = el('div', { class: 'email-settings-form' }, [
    textField('smtpHost', 'SMTP Host', 'smtp.gmail.com'),
    textField('smtpPort', 'SMTP Port', '587', 'number'),
    checkboxField('smtpSecure', 'Use SSL/TLS (port 465)'),
    textField('smtpUser', 'SMTP Username'),
    textField('smtpPass', 'SMTP Password', emailSettings.smtpPassSet ? '(unchanged \u2014 leave blank to keep)' : '', 'password'),
    textField('fromEmail', 'From Email', 'reports@yourstore.com'),
    textField('fromName', 'From Name', 'Xeoscape'),
    textField('recipients', 'Report Recipients', 'owner@yourstore.com, manager@yourstore.com'),
    checkboxField('scheduleEnabled', 'Enable automated scheduled reports'),
    el('div', { class: 'form-field' }, [el('label', {}, 'Frequency'), frequencySelect]),
    el('div', { style: 'display:flex; gap:0.5rem; margin-top:0.5rem;' }, [
      el('button', {
        class: 'btn btn-primary',
        onClick: async () => {
          try {
            const updated = await apiClient.put('/settings/email', values);
            notification.success('Email settings saved.');
            values.smtpPass = '';
            emailSettings.smtpPassSet = updated.smtpPassSet;
          } catch (err) {
            notification.error(err.message);
          }
        }
      }, 'Save Email Settings'),
      el('button', {
        class: 'btn btn-secondary',
        onClick: async () => {
          try {
            const result = await apiClient.post('/reports/test-email', {});
            notification.success(`Test email sent to ${result.sentTo.join(', ')}`);
          } catch (err) {
            notification.error(err.message);
          }
        }
      }, 'Send Test Email')
    ])
  ]);

  container.appendChild(emailForm);
}
