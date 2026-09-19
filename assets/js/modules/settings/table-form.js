// assets/js/modules/settings/table-form.js
// Create/edit form for a single restaurant/cafe table (a number/name
// plus how many seats it has). Mirrors
// assets/js/modules/categories/category-form.js.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';

export function openTableForm({ table = null, onSaved } = {}) {
  const values = { number: '', seats: 4, ...(table || {}) };

  const numberInput = el('input', {
    value: values.number,
    placeholder: 'e.g. 1, 12, Patio-3',
    onInput: (e) => (values.number = e.target.value)
  });
  const seatsInput = el('input', {
    type: 'number',
    min: '1',
    step: '1',
    value: values.seats,
    onInput: (e) => (values.seats = e.target.value)
  });

  const form = el('div', {}, [
    el('div', { class: 'form-field' }, [el('label', {}, 'Table Number *'), numberInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Seats *'), seatsInput])
  ]);

  modalManager.open({
    title: table ? 'Edit Table' : 'New Table',
    content: form,
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      {
        label: 'Save',
        className: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          if (!String(values.number).trim()) {
            notification.error('Table number is required.');
            return;
          }
          if (!Number(values.seats) || Number(values.seats) <= 0) {
            notification.error('Seats must be a positive number.');
            return;
          }
          try {
            const payload = { number: values.number, seats: Number(values.seats) };
            if (table) {
              await apiClient.put(`/tables/${table.id}`, payload);
            } else {
              await apiClient.post('/tables', payload);
            }
            notification.success('Table saved.');
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
