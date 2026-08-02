// assets/js/modules/categories/category-table-modal.js
// "Categories" button opens this modal: a searchable data table listing
// categories, matching the real Categories popup pattern.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import modalManager from '../../ui/modal-manager.js';
import { openCategoryForm } from './category-form.js';
import notification from '../../ui/notification.js';

export function openCategoryTableModal() {
  let search = '';

  const searchInput = el('input', {
    class: 'search-input',
    placeholder: 'Search...',
    onInput: (e) => { search = e.target.value; refresh(); }
  });

  const tableWrap = el('div', { class: 'table-container' });

  const content = el('div', {}, [
    el('div', { class: 'datatable-search-row' }, [el('span', {}, 'Search:'), searchInput]),
    tableWrap
  ]);

  modalManager.open({ title: 'Categories', content, size: 'lg', actions: [{ label: 'Close', className: 'btn-secondary' }] });

  async function refresh() {
    try {
      let categories = await apiClient.get('/categories');
      if (search) {
        const q = search.toLowerCase();
        categories = categories.filter((c) => c.name.toLowerCase().includes(q));
      }
      renderCategoriesTable(tableWrap, categories, refresh);
    } catch (err) {
      notification.error(`Failed to load categories: ${err.message}`);
    }
  }

  refresh();
}

function renderCategoriesTable(container, categories, onChange) {
  container.innerHTML = '';

  if (categories.length === 0) {
    container.appendChild(el('div', { class: 'table-empty' }, 'No data available in table'));
    return;
  }

  const thead = el('thead', {}, [el('tr', {}, ['Name', 'Description', 'Action'].map((h) => el('th', {}, h)))]);

  const rows = categories.map((c) => el('tr', {}, [
    el('td', {}, c.name),
    el('td', {}, c.description || '-'),
    el('td', { class: 'action' }, [
      el('button', { class: 'btn btn-sm btn-primary', onClick: () => openCategoryForm({ category: c, onSaved: onChange }) }, '\u270E'),
      el('button', {
        class: 'btn btn-sm btn-danger',
        onClick: async () => {
          if (!window.confirm(`Delete "${c.name}"?`)) return;
          try {
            await apiClient.delete(`/categories/${c.id}`);
            notification.success('Category deleted.');
            onChange();
          } catch (err) {
            notification.error(err.message);
          }
        }
      }, '\u2715')
    ])
  ]));

  container.appendChild(el('table', { class: 'app-table' }, [thead, el('tbody', {}, rows)]));
}
