// assets/js/modules/categories/category-list.js
// Category management page, wired to /api/categories.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { renderTable } from '../../ui/table-manager.js';
import { openCategoryForm } from './category-form.js';
import { openCsvImportModal } from '../../ui/csv-import-modal.js';
import { createActionMenu } from '../../ui/action-menu.js';
import notification from '../../ui/notification.js';

export async function mountCategoryList(container) {
  container.appendChild(el('div', { class: 'view-header' }, [
    el('h2', {}, 'Categories'),
    createActionMenu([
      {
        label: '\u2b06 Import CSV',
        onClick: () => openCsvImportModal({
          title: 'Import Categories from CSV',
          templateEndpoint: '/categories/csv-template',
          templateFilename: 'category-import-template.csv',
          importEndpoint: '/categories/csv-import',
          onImported: () => refresh()
        })
      }
    ]),
    el('button', { class: 'btn btn-primary', onClick: () => openCategoryForm({ onSaved: () => refresh() }) }, '+ New Category')
  ]));

  const tableContainer = el('div', { class: 'table-container' });
  container.appendChild(tableContainer);

  async function refresh() {
    try {
      const categories = await apiClient.get('/categories');
      renderTable(tableContainer, {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'description', label: 'Description' }
        ],
        rows: categories,
        onRowClick: (category) => openCategoryForm({ category, onSaved: () => refresh() }),
        emptyMessage: 'No categories yet. Create your first one above.'
      });
    } catch (err) {
      notification.error(`Failed to load categories: ${err.message}`);
    }
  }

  await refresh();
}
