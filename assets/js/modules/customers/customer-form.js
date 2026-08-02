// assets/js/modules/customers/customer-form.js
// Create/edit form for customer records.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';

export function openCustomerForm({ customer = null, onSaved } = {}) {
  const values = { name: '', phone: '', email: '', ...(customer || {}) };

  const nameInput = el('input', { value: values.name, onInput: (e) => (values.name = e.target.value) });
  const phoneInput = el('input', { value: values.phone, onInput: (e) => (values.phone = e.target.value) });
  const emailInput = el('input', { value: values.email, onInput: (e) => (values.email = e.target.value) });

  const form = el('div', { class: 'customer-form' }, [
    el('div', { class: 'form-field' }, [el('label', {}, 'Name *'), nameInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Phone'), phoneInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Email'), emailInput])
  ]);

  modalManager.open({
    title: customer ? 'Edit Customer' : 'New Customer',
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
            if (customer) {
              await apiClient.put(`/customers/${customer.id}`, values);
            } else {
              await apiClient.post('/customers', values);
            }
            notification.success('Customer saved.');
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
