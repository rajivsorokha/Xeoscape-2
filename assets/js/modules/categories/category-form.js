// assets/js/modules/categories/category-form.js
// Create/edit form for product categories.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';

export function openCategoryForm({ category = null, onSaved } = {}) {
  const values = { name: '', description: '', ...(category || {}) };

  const nameInput = el('input', { value: values.name, onInput: (e) => (values.name = e.target.value) });
  const descInput = el('input', { value: values.description, onInput: (e) => (values.description = e.target.value) });

  const form = el('div', {}, [
    el('div', { class: 'form-field' }, [el('label', {}, 'Name *'), nameInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Description'), descInput])
  ]);

  modalManager.open({
    title: category ? 'Edit Category' : 'New Category',
    content: form,
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      {
        label: 'Save',
        className: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          if (!values.name.trim()) {
            notification.error('Name is required.');
            return;
          }
          try {
            if (category) {
              await apiClient.put(`/categories/${category.id}`, values);
            } else {
              await apiClient.post('/categories', values);
            }
            notification.success('Category saved.');
            modalManager.close();
            onSaved?.();
          } catch (err) {
            notification.error(err.message);
          }
        }
      }
    ]
  });
}
