// assets/js/modules/settings/email-settings-panel.js
// "Send via Email" section: SMTP configuration and scheduled automated
// report emails. Report generation itself lives in the separate
// "Report Generator" section (report-generator-settings.js).
//
// renderEmailForm() is shared with the Settings popup
// (reports-settings.js), so both screens behave identically.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import notification from '../../ui/notification.js';

function hourLabel(h) {
  const suffix = h < 12 ? 'AM' : 'PM';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${suffix}`;
}

export async function renderEmailForm(container) {
  const emailSettings = await apiClient.get('/settings/email');
  // smtpPassSet is a read-only flag from the server, never something to send back.
  const { smtpPassSet, ...rest } = emailSettings;
  const values = { ...rest, smtpPass: '' };
  const inputs = {};

  function textField(key, label, placeholder = '', type = 'text') {
    const input = el('input', {
      type,
      value: values[key] ?? '',
      placeholder,
      onInput: (e) => { values[key] = e.target.value; }
    });
    inputs[key] = input;
    return el('div', { class: 'form-field' }, [el('label', {}, label), input]);
  }

  const secureBox = el('input', { type: 'checkbox', checked: Boolean(values.smtpSecure) });
  secureBox.addEventListener('change', (e) => {
    values.smtpSecure = e.target.checked;
    // Keep the port in step with the tick box -- 465 needs SSL/TLS and
    // 587 must not have it, and mixing them is the commonest reason a
    // first setup fails.
    const port = String(inputs.smtpPort.value || '').trim();
    if (e.target.checked && (port === '' || port === '587')) {
      inputs.smtpPort.value = '465';
      values.smtpPort = '465';
    } else if (!e.target.checked && port === '465') {
      inputs.smtpPort.value = '587';
      values.smtpPort = '587';
    }
  });

  const scheduleBox = el('input', {
    type: 'checkbox',
    checked: Boolean(values.scheduleEnabled),
    onChange: (e) => { values.scheduleEnabled = e.target.checked; }
  });

  const frequencySelect = el('select', {
    onChange: (e) => { values.scheduleFrequency = e.target.value; }
  }, [
    el('option', { value: 'daily' }, 'Daily \u2014 that day\u2019s sales'),
    el('option', { value: 'weekly' }, 'Weekly \u2014 every Sunday, last 7 days'),
    el('option', { value: 'monthly' }, 'Monthly \u2014 last day of month, last 30 days')
  ]);
  frequencySelect.value = values.scheduleFrequency || 'daily';

  const hourSelect = el('select', {
    onChange: (e) => { values.scheduleHour = Number(e.target.value); }
  }, Array.from({ length: 24 }, (_, h) => el('option', { value: String(h) }, hourLabel(h))));
  hourSelect.value = String(values.scheduleHour ?? 21);

  const saveBtn = el('button', { class: 'btn btn-primary' }, 'Save Email Settings');
  const testBtn = el('button', { class: 'btn btn-secondary' }, 'Send Test Email');

  async function save() {
    const updated = await apiClient.put('/settings/email', values);
    values.smtpPass = '';
    inputs.smtpPass.value = '';
    inputs.smtpPass.placeholder = updated.smtpPassSet ? '(saved \u2014 leave blank to keep)' : '';
    // Show what was actually stored (trimmed, port as a number, ...).
    ['smtpHost', 'smtpPort', 'smtpUser', 'fromEmail', 'fromName', 'recipients'].forEach((key) => {
      values[key] = updated[key];
      inputs[key].value = updated[key] ?? '';
    });
    return updated;
  }

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      await save();
      notification.success('Email settings saved.');
    } catch (err) {
      notification.error(err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  // The test uses whatever is typed in the form: it saves first, then
  // sends. Previously it used the last *saved* settings, so a test
  // after typing a new password silently tested the old one.
  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    testBtn.textContent = 'Sending\u2026';
    try {
      await save();
      const result = await apiClient.post('/reports/test-email', {});
      notification.success(`Test email sent to ${result.sentTo.join(', ')}. Check the inbox (and spam folder).`);
    } catch (err) {
      notification.error(err.message);
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'Send Test Email';
    }
  });

  container.appendChild(el('div', { class: 'email-settings-form' }, [
    el('p', { class: 'settings-hint' },
      'Gmail: smtp.gmail.com, port 587 (SSL/TLS unticked) or 465 (ticked), and an App Password instead of your '
      + 'normal password. Outlook/Office 365: smtp.office365.com, port 587.'),
    textField('smtpHost', 'SMTP Host', 'smtp.gmail.com'),
    textField('smtpPort', 'SMTP Port', '587', 'number'),
    el('div', { class: 'form-field' }, [el('label', { class: 'perm-checkbox' }, [secureBox, ' Use SSL/TLS (port 465)'])]),
    textField('smtpUser', 'SMTP Username', 'you@gmail.com'),
    textField('smtpPass', 'SMTP Password', smtpPassSet ? '(saved \u2014 leave blank to keep)' : '', 'password'),
    textField('fromEmail', 'From Email', 'leave blank to use the username'),
    textField('fromName', 'From Name', 'Xeoscape'),
    textField('recipients', 'Report Recipients', 'owner@yourstore.com, manager@yourstore.com'),
    el('div', { class: 'form-field' }, [el('label', { class: 'perm-checkbox' }, [scheduleBox, ' Enable automated scheduled reports'])]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Frequency'), frequencySelect]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Send at (this computer\u2019s time)'), hourSelect]),
    el('p', { class: 'settings-hint' }, 'Scheduled reports only go out while the app is running at that time.'),
    el('div', { style: 'display:flex; gap:0.5rem; margin-top:0.5rem;' }, [saveBtn, testBtn])
  ]));
}

export async function mountEmailSettings(container) {
  container.appendChild(el('h3', {}, 'Send via Email'));
  container.appendChild(el('p', { class: 'settings-hint' }, 'Configure the outgoing mail server and, optionally, an automatic sending schedule.'));
  await renderEmailForm(container);
}
