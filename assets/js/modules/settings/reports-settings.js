// assets/js/modules/settings/reports-settings.js
// "Reports & Email" section: generate a sales report for a preset
// range (Today / 2 Days / Week / Month), send it by email on demand,
// and configure SMTP + scheduled automated report emails.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import notification from '../../ui/notification.js';
import { renderEmailForm } from './email-settings-panel.js';

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

  await renderEmailForm(container);

  await loadSummary();
}
