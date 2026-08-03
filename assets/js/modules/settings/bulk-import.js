// assets/js/modules/settings/bulk-import.js
// "Bulk Product Import" settings section: import many products at
// once from a CSV file. Moved here from the POS catalog toolbar --
// it's an occasional setup/maintenance task, not something that
// belongs cluttering the day-to-day checkout screen.

import { el } from '../../shared/utils.js';
import { openCsvImportModal } from '../../ui/csv-import-modal.js';

export async function mountBulkImport(container) {
  container.appendChild(el('h3', {}, 'Bulk Product Import'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'Add or update many products at once from a CSV file. Download the template first to see the columns for your current store type (including the optional Cost Price column, used for margin reporting).'
  ));

  container.appendChild(el('button', {
    class: 'btn btn-primary',
    onClick: () => openCsvImportModal({
      title: 'Import Products from CSV',
      templateEndpoint: '/inventory/products/csv-template',
      templateFilename: 'product-import-template.csv',
      importEndpoint: '/inventory/products/csv-import'
    })
  }, '\u2b06 Import Products from CSV'));
}
