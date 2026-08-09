// assets/js/modules/customers/customer-form.js
// Create/edit form for customer records.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';

export function openCustomerForm({ customer = null, onSaved } = {}) {
  const values = { name: '', phone: '', email: '', ...(customer || {}) };
  const symbol = settingsStore.getCurrencySymbol();

  const nameInput = el('input', { value: values.name, onInput: (e) => (values.name = e.target.value) });
  const phoneInput = el('input', { value: values.phone, onInput: (e) => (values.phone = e.target.value) });
  const emailInput = el('input', { value: values.email, onInput: (e) => (values.email = e.target.value) });

  const formFields = [
    el('div', { class: 'form-field' }, [el('label', {}, 'Name *'), nameInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Phone'), phoneInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Email'), emailInput])
  ];

  // Balance/due-payment section only makes sense for an existing
  // customer who's actually accrued a balance (see
  // core/transaction-manager.js#checkout's partial/due payment
  // handling, which is B2B General Retail only -- so a balance here
  // implicitly means this is a B2B account already).
  if (customer && customer.balance > 0) {
    let payAmount = '';
    const payInput = el('input', { type: 'number', min: '0', step: '0.01', max: String(customer.balance), placeholder: '0.00', onInput: (e) => { payAmount = e.target.value; } });
    const reminderBtn = el('button', {
      class: 'btn btn-secondary',
      type: 'button',
      onClick: async (e) => {
        e.target.disabled = true;
        try {
          await apiClient.post(`/whatsapp/send-reminder/${customer.id}`, {});
          notification.success(`WhatsApp reminder sent to ${customer.name}.`);
        } catch (err) {
          notification.error(err.message);
        } finally {
          e.target.disabled = false;
        }
      }
    }, '\u{1F4F1} Send WhatsApp Reminder');

    formFields.push(el('div', { class: 'settings-section' }, [
      el('h4', {}, 'Balance Due'),
      el('p', { class: 'settings-hint' }, `Currently owes ${formatMoney(customer.balance, symbol)} from partial/due payments.`),
      el('div', { style: 'display:flex; gap:0.5rem; align-items:flex-end; flex-wrap:wrap;' }, [
        el('div', { class: 'form-field', style: 'flex:1;' }, [el('label', {}, 'Record a Payment'), payInput]),
        el('button', {
          class: 'btn btn-secondary',
          type: 'button',
          onClick: async () => {
            const amount = Number(payAmount);
            if (!Number.isFinite(amount) || amount <= 0) {
              notification.error('Enter a valid payment amount.');
              return;
            }
            try {
              await apiClient.post(`/customers/${customer.id}/pay-balance`, { amount });
              notification.success('Payment recorded.');
              modalManager.close();
              onSaved?.();
            } catch (err) {
              notification.error(err.message);
            }
          }
        }, 'Record Payment'),
        reminderBtn
      ])
    ]));
  }

  const form = el('div', { class: 'customer-form' }, formFields);

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
