// assets/js/modules/settings/report-generator-settings.js
// "Report Generator" section: generate a sales report for a preset
// range (Today / 2 Days / Week / Month) and optionally email it on
// demand. SMTP configuration and scheduling live in the separate
// "Send via Email" section (email-settings-panel.js).

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

export async function mountReportGenerator(container) {
  container.appendChild(el('h3', {}, 'Report Generator'));
  container.appendChild(el('p', { class: 'settings-hint' }, 'Generate a sales report for a period, and optionally email it immediately.'));

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

  const downloadBtn = el('button', {
    class: 'btn btn-primary',
    onClick: async () => {
      try {
        const safeLabel = RANGES.find((r) => r.id === selectedRange).label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await apiClient.downloadFile(`/reports/pdf?range=${selectedRange}`, `sales-report-${safeLabel}.pdf`);
        notification.success('Report downloaded as PDF.');
      } catch (err) {
        notification.error(err.message);
      }
    }
  }, '\u2b07 Download PDF');

  container.appendChild(el('div', { class: 'report-range-row' }, rangeButtons));
  container.appendChild(summaryBox);
  container.appendChild(el('div', { class: 'report-actions-row' }, [downloadBtn, sendNowBtn]));

  async function loadSummary() {
    summaryBox.textContent = 'Loading...';
    try {
      const report = await apiClient.get(`/reports/summary?range=${selectedRange}`);
      summaryBox.innerHTML = '';
      summaryBox.appendChild(el('div', { class: 'report-summary-grid' }, [
        el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Revenue'), el('div', { class: 'report-summary-value' }, formatMoney(report.summary.totalRevenue))]),
        el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Transactions'), el('div', { class: 'report-summary-value' }, String(report.summary.totalTransactions))]),
        el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Items Sold'), el('div', { class: 'report-summary-value' }, String(report.summary.itemsSold))]),
        el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Avg. Sale'), el('div', { class: 'report-summary-value' }, formatMoney(report.summary.averageTransactionValue))]),
        el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Collected'), el('div', { class: 'report-summary-value' }, formatMoney(report.summary.totalPaid))]),
        el('div', { class: 'report-summary-cell' }, [
          el('div', { class: 'report-summary-label' }, 'Credit Extended'),
          el('div', { class: 'report-summary-value', style: report.summary.totalDue > 0 ? 'color:var(--color-danger);' : '' }, formatMoney(report.summary.totalDue))
        ])
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

  await loadSummary();
}
