// assets/js/modules/settings/reports-settings.js
// "Reports & Email" section: generate a sales report for a preset
// range (Today / 2 Days / Week / Month), send it by email on demand,
// and configure SMTP + scheduled automated report emails.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import notification from '../../ui/notification.js';

const RANGES = [
  { id: 'today', label: 'Today' },
  { id: '2days', label: '2 Days' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' }
];

export async function mountReportsSettings(container) {
  container.appendChild(el('h3', {}, 'Report Generator'));

  let selectedRange = 'today';
  const summaryBox = el('div', { class: 'report-summary-box' }, 'Select a period above to generate a report.');

  const rangeButtons = RANGES.map(({ id, label }) => {
    const btn = el('button', {
      class: `btn btn-sm ${id === selectedRange ? 'btn-primary' : 'btn-secondary'}`,
      onClick: () => {
        selectedRange = id;
        rangeButtons.forEach((b) => b.classList.remove('btn-primary'));
        rangeButtons.forEach((b) => b.classList.add('btn-secondary'));
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        loadSummary();
      }
    }, label);
    return btn;
  });

  const sendNowBtn = el('button', {
    class: 'btn btn-success',
    onClick: async () => {
      try {
        const result = await apiClient.post('/reports/send', { range: selectedRange });
        notification.success(`Report emailed to ${result.sentTo.join(', ')}`);
      } catch (err) {
        notification.error(err.message);
      }
    }
  }, '\u2709 Send via Email Now');

  container.appendChild(el('div', { class: 'report-range-row' }, rangeButtons));
  container.appendChild(summaryBox);
  container.appendChild(sendNowBtn);

  async function loadSummary() {
    summaryBox.textContent = 'Loading...';
    try {
      const report = await apiClient.get(`/reports/summary?range=${selectedRange}`);
      summaryBox.innerHTML = '';
      summaryBox.appendChild(el('div', { class: 'report-summary-grid' }, [
        el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Revenue'), el('div', { class: 'report-summary-value' }, formatMoney(report.summary.totalRevenue))]),
        el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Transactions'), el('div', { class: 'report-summary-value' }, String(report.summary.totalTransactions))]),
        el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Items Sold'), el('div', { class: 'report-summary-value' }, String(report.summary.itemsSold))]),
        el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Avg. Sale'), el('div', { class: 'report-summary-value' }, formatMoney(report.summary.averageTransactionValue))])
      ]));
      if (report.topProducts.length) {
        summaryBox.appendChild(el('div', { class: 'report-top-products' }, [
          el('strong', {}, 'Top Products: '),
          report.topProducts.slice(0, 5).map((p) => `${p.name} (${p.quantity})`).join(', ')
        ]));
      }
    } catch (err) {
      notification.error(`Failed to load report: ${err.message}`);
    }
  }

  // --- SMTP / scheduled automation settings ---
  container.appendChild(el('h3', { style: 'margin-top:1.5rem;' }, 'Email Automation'));

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

  await loadSummary();
}
