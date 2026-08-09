// assets/js/modules/alerts/alerts-widget.js
// "Alerts" nav button: badge showing combined low-stock + expiring-
// soon count, dropdown listing both. Polls periodically so a cashier
// doesn't have to go looking in Settings to notice a problem. Shows a
// one-time toast on app start if there's anything to see.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import notification from '../../ui/notification.js';
import { formatShortDate } from '../../shared/formatters.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function mountAlertsWidget(navContainer) {
  let open = false;
  let lastData = { lowStock: [], expiring: [], count: 0 };
  let toastedOnce = false;

  const badge = el('span', { class: 'alerts-badge', style: 'display:none;' }, '0');
  const toggleBtn = el('button', { class: 'nav-btn nav-btn-warning alerts-toggle', type: 'button' }, [
    '\u{1F514} Alerts', badge
  ]);
  const dock = el('div', { class: 'alerts-dock' }, [toggleBtn]);
  navContainer.appendChild(dock);

  const panel = el('div', { class: 'alerts-panel', style: 'display:none;' });
  document.body.appendChild(panel);

  function positionPanel() {
    const rect = toggleBtn.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 8}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;
  }
  function openPanel() {
    open = true;
    positionPanel();
    panel.style.display = 'block';
    renderPanel();
  }
  function closePanel() {
    open = false;
    panel.style.display = 'none';
  }
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    open ? closePanel() : openPanel();
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { if (open) closePanel(); });
  window.addEventListener('resize', () => { if (open) positionPanel(); });

  function renderPanel() {
    panel.innerHTML = '';
    if (lastData.count === 0) {
      panel.appendChild(el('div', { class: 'alerts-empty' }, 'No alerts \u2014 stock and expiry dates all look fine. \u2705'));
      return;
    }
    if (lastData.lowStock.length) {
      panel.appendChild(el('div', { class: 'alerts-section-title' }, `Low Stock (${lastData.lowStock.length})`));
      lastData.lowStock.slice(0, 8).forEach((p) => {
        panel.appendChild(el('div', { class: 'alerts-row' }, [
          el('span', {}, p.name),
          el('span', { class: 'alerts-row-detail' }, `${p.stock} left (reorder at ${p.reorderPoint})`)
        ]));
      });
    }
    if (lastData.expiring.length) {
      panel.appendChild(el('div', { class: 'alerts-section-title' }, `Expiring Soon (${lastData.expiring.length})`));
      lastData.expiring.slice(0, 8).forEach((p) => {
        const isPast = new Date(p.expirationDate) < new Date();
        panel.appendChild(el('div', { class: 'alerts-row' }, [
          el('span', {}, p.name),
          el('span', { class: `alerts-row-detail${isPast ? ' alerts-expired' : ''}` }, isPast ? 'Expired' : formatShortDate(p.expirationDate))
        ]));
      });
    }
    panel.appendChild(el('p', { class: 'settings-hint', style: 'padding:0.5rem 0.75rem;' },
      'Full lists: Settings \u2192 Low Stock / Stock on Hand.'
    ));
  }

  async function refresh() {
    try {
      const data = await apiClient.get('/inventory/alerts');
      lastData = data;
      badge.textContent = String(data.count);
      badge.style.display = data.count > 0 ? 'inline-block' : 'none';
      if (open) renderPanel();
      if (data.count > 0 && !toastedOnce) {
        toastedOnce = true;
        notification.warning(`${data.lowStock.length} item(s) low on stock, ${data.expiring.length} expiring soon.`);
      }
    } catch (err) {
      // Non-fatal -- alerts are a nice-to-have, not core functionality.
    }
  }

  refresh();
  setInterval(refresh, POLL_INTERVAL_MS);
}
