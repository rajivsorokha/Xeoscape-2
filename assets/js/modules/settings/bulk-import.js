// assets/js/modules/settings/bulk-import.js
// "Bulk Product Import" settings section: import many products (and
// categories) at once from a CSV file, or clear out the current store
// type's existing catalog first -- e.g. replacing a demo/seed catalog
// with a real one. Moved here from the POS catalog toolbar -- it's an
// occasional setup/maintenance task, not something that belongs
// cluttering the day-to-day checkout screen.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { openCsvImportModal } from '../../ui/csv-import-modal.js';
import notification from '../../ui/notification.js';

export async function mountBulkImport(container) {
  container.appendChild(el('h3', {}, 'Bulk Product Import'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'Add or update many products at once from a CSV file. Download the template first to see the columns for your current store type (including the optional Cost Price column, used for margin reporting).'
  ));

  container.appendChild(el('div', { style: 'display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:1.5rem;' }, [
    el('button', {
      class: 'btn btn-primary',
      onClick: () => openCsvImportModal({
        title: 'Import Products from CSV',
        templateEndpoint: '/inventory/products/csv-template',
        templateFilename: 'product-import-template.csv',
        importEndpoint: '/inventory/products/csv-import'
      })
    }, '\u2b06 Import Products from CSV'),
    el('button', {
      class: 'btn btn-secondary',
      onClick: () => openCsvImportModal({
        title: 'Import Categories from CSV',
        templateEndpoint: '/categories/csv-template',
        templateFilename: 'category-import-template.csv',
        importEndpoint: '/categories/csv-import'
      })
    }, '\u2b06 Import Categories from CSV')
  ]));

  container.appendChild(el('div', { class: 'settings-section' }, [
    el('h4', {}, 'Clear Current Catalog'),
    el('p', { class: 'settings-hint' },
      'Permanently deletes every product and/or category belonging to your CURRENT store type only (other store types\u2019 catalogs are never touched). ' +
      'Use this before a bulk import to replace an old/demo catalog with a fresh one, rather than ending up with both mixed together.'
    ),
    el('div', { style: 'display:flex; gap:0.5rem; flex-wrap:wrap;' }, [
      el('button', {
        class: 'btn btn-danger',
        onClick: async (e) => {
          if (!window.confirm('Delete ALL products for the current store type? This cannot be undone.')) return;
          const btn = e.target;
          btn.disabled = true;
          try {
            const result = await apiClient.delete('/inventory/products');
            notification.success(`Deleted ${result.removed} product(s).`);
          } catch (err) {
            notification.error(err.message);
          } finally {
            btn.disabled = false;
          }
        }
      }, '\ud83d\uddd1 Clear All Products'),
      el('button', {
        class: 'btn btn-danger',
        onClick: async (e) => {
          if (!window.confirm('Delete ALL categories for the current store type? This cannot be undone.')) return;
          const btn = e.target;
          btn.disabled = true;
          try {
            const result = await apiClient.delete('/categories');
            notification.success(`Deleted ${result.removed} categor${result.removed === 1 ? 'y' : 'ies'}.`);
          } catch (err) {
            notification.error(err.message);
          } finally {
            btn.disabled = false;
          }
        }
      }, '\ud83d\uddd1 Clear All Categories')
    ])
  ]));
}
