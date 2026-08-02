// assets/js/modules/settings/store-profile.js
// Store profile form: name, address, contact, GST/tax, currency symbol,
// quick billing, and receipt footer -- matching PharmaSpot's real
// Settings screen fields exactly.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import settingsStore from '../../shared/settings-store.js';
import notification from '../../ui/notification.js';

export async function mountStoreProfile(container) {
  container.appendChild(el('h3', {}, 'Store Profile'));

  const profile = await apiClient.get('/settings/profile');
  const values = { ...profile };

  function textField(key, label, placeholder = '') {
    const input = el('input', {
      type: 'text',
      value: values[key] || '',
      placeholder,
      onInput: (e) => { values[key] = e.target.value; }
    });
    return el('div', { class: 'form-field' }, [el('label', {}, label), input]);
  }

  function numberField(key, label) {
    const input = el('input', {
      type: 'number',
      min: '0',
      value: values[key] ?? 0,
      onInput: (e) => { values[key] = Number(e.target.value) || 0; }
    });
    return el('div', { class: 'form-field' }, [el('label', {}, label), input]);
  }

  function checkboxField(key, label) {
    const checkbox = el('input', {
      type: 'checkbox',
      checked: Boolean(values[key]),
      onChange: (e) => { values[key] = e.target.checked; }
    });
    return el('div', { class: 'form-field' }, [el('label', { class: 'perm-checkbox' }, [checkbox, ` ${label}`])]);
  }

  const form = el('div', { class: 'store-profile-form' }, [
    textField('storeName', 'Store Name', 'Cool Pharmacy'),
    textField('addressLine1', 'Address Line 1', '123 Main Street, Building #'),
    textField('addressLine2', 'Address Line 2', 'City, Country'),
    textField('contactNumber', 'Contact Number', '0800 111 000'),
    textField('taxId', 'GST Number (GSTIN)'),
    textField('currencySymbol', 'Currency Symbol', 'USD'),
    numberField('taxPercentage', 'GST Percentage'),
    checkboxField('chargeTax', 'Charge GST'),
    checkboxField('quickBilling', 'Quick Billing (skip payment confirmation)'),
    (() => {
      const textarea = el('textarea', {
        rows: '3',
        onInput: (e) => { values.receiptFooter = e.target.value; }
      }, values.receiptFooter || '');
      return el('div', { class: 'form-field' }, [el('label', {}, 'Receipt Footer'), textarea]);
    })(),
    el('button', {
      class: 'btn btn-primary',
      onClick: async () => {
        try {
          const updated = await apiClient.put('/settings/profile', values);
          Object.assign(values, updated);
          await settingsStore.load();
          notification.success('Store profile saved.');
        } catch (err) {
          notification.error(err.message);
        }
      }
    }, 'Save Settings')
  ]);

  container.appendChild(form);
}
