// assets/js/modules/settings/settings-page.js
// Full-page Settings view (like the Transactions screen -- a
// router-registered page, not a modal). A side menu lists each
// section; only the selected one is mounted into the content area at
// a time.

import { el } from '../../shared/utils.js';
import { mountStoreProfile } from './store-profile.js';
import { mountStoreTypeConfig } from './store-type-config.js';
import { mountReportGenerator } from './report-generator-settings.js';
import { mountProductPerformance } from './product-performance.js';
import { mountLowStockReport } from './low-stock-report.js';
import { mountSupplierList } from '../suppliers/supplier-list.js';
import { mountExpenses } from './expenses.js';
import { mountTallyIntegration } from './tally-integration.js';
import { mountQuickScanAdd } from '../products/quick-scan-add.js';
import { mountWhatsAppReminders } from './whatsapp-reminders.js';
import { mountPurchaseOrders } from './purchase-orders.js';
import { mountStockOnHand } from './stock-on-hand.js';
import { mountEmailSettings } from './email-settings-panel.js';
import { mountAiSettings } from './ai-settings-panel.js';
import { mountBackupSettings } from './backup-settings.js';
import { mountBulkImport } from './bulk-import.js';
import { createBackToPosButton } from '../../ui/back-to-pos-button.js';
import notification from '../../ui/notification.js';

const SECTIONS = [
  { id: 'store-profile', label: 'Store Profile', mount: mountStoreProfile },
  { id: 'store-type', label: 'Store Type', mount: (container, ctx) => mountStoreTypeConfig(container, { onChanged: ctx.onStoreTypeChanged }) },
  { id: 'bulk-import', label: 'Bulk Product Import', mount: mountBulkImport },
  { id: 'quick-scan-add', label: 'Quick Scan Add', mount: mountQuickScanAdd },
  { id: 'whatsapp-reminders', label: 'WhatsApp Reminders', mount: mountWhatsAppReminders },
  { id: 'report-generator', label: 'Report Generator', mount: mountReportGenerator },
  { id: 'product-performance', label: 'Product Performance (ABC)', mount: mountProductPerformance },
  { id: 'low-stock', label: 'Low Stock', mount: mountLowStockReport },
  { id: 'suppliers', label: 'Suppliers', mount: mountSupplierList },
  { id: 'expenses', label: 'Expenses', mount: mountExpenses },
  { id: 'tally', label: 'Tally Integration', mount: mountTallyIntegration },
  { id: 'purchase-orders', label: 'Purchase Orders', mount: mountPurchaseOrders },
  { id: 'stock-on-hand', label: 'Stock on Hand', mount: mountStockOnHand },
  { id: 'send-email', label: 'Send via Email', mount: mountEmailSettings },
  { id: 'ai-assistant', label: 'AI Assistant', mount: mountAiSettings },
  { id: 'data-backups', label: 'Data Backups', mount: mountBackupSettings }
];

export async function mountSettingsPage(container, { onStoreTypeChanged } = {}) {
  let activeId = SECTIONS[0].id;

  const menu = el('nav', { class: 'settings-page-menu' },
    SECTIONS.map((section) => el('button', {
      class: `settings-page-menu-item${section.id === activeId ? ' active' : ''}`,
      onClick: () => selectSection(section.id)
    }, section.label))
  );

  const content = el('div', { class: 'settings-page-content' });

  container.appendChild(el('div', { class: 'view-header' }, [el('h2', {}, 'Settings'), createBackToPosButton()]));
  container.appendChild(el('div', { class: 'settings-page-layout' }, [menu, content]));

  async function selectSection(id) {
    activeId = id;
    [...menu.children].forEach((btn, i) => {
      btn.classList.toggle('active', SECTIONS[i].id === id);
    });

    const section = SECTIONS.find((s) => s.id === id);
    content.innerHTML = '';
    content.appendChild(el('div', {}, 'Loading...'));
    try {
      content.innerHTML = '';
      await section.mount(content, { onStoreTypeChanged });
    } catch (err) {
      content.innerHTML = '';
      notification.error(`Failed to load ${section.label}: ${err.message}`);
    }
  }

  await selectSection(activeId);
}
