// assets/js/modules/suppliers/supplier-form.js
// Create/edit form for supplier records.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';

export function openSupplierForm({ supplier = null, onSaved } = {}) {
  const values = { name: '', contactPerson: '', phone: '', email: '', address: '', notes: '', ...(supplier || {}) };

  const field = (key, label, type = 'text') => {
    const input = type === 'textarea'
      ? el('textarea', { rows: '2', value: values[key] || '', onInput: (e) => (values[key] = e.target.value) }, values[key] || '')
      : el('input', { type, value: values[key] || '', onInput: (e) => (values[key] = e.target.value) });
    return el('div', { class: 'form-field' }, [el('label', {}, label), input]);
  };

  const form = el('div', { class: 'supplier-form' }, [
    field('name', 'Supplier Name *'),
    field('contactPerson', 'Contact Person'),
    field('phone', 'Phone'),
    field('email', 'Email'),
    field('address', 'Address', 'textarea'),
    field('notes', 'Notes', 'textarea')
  ]);

  modalManager.open({
    title: supplier ? 'Edit Supplier' : 'New Supplier',
    content: form,
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      {
        label: 'Save',
        className: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          if (!values.name.trim()) {
            notification.error('Supplier name is required.');
            return;
          }
          try {
            if (supplier) {
              await apiClient.put(`/suppliers/${supplier.id}`, values);
            } else {
              await apiClient.post('/suppliers', values);
            }
            notification.success('Supplier saved.');
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
