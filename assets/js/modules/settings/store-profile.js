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

  // --- Application: how this install is deployed. ---
  // NOTE ON SCOPE: this captures and persists the choice (and, for the
  // two networked modes, the address/port it needs), which is enough
  // for the setting to exist and to inform a future multi-till sync
  // feature. It does not itself make this till start syncing with
  // another one -- that's a separate, larger backend feature (a sync
  // protocol between Xeoscape instances) that isn't built yet.
  const APPLICATION_TYPES = [
    { value: 'standalone', label: 'Standalone Point of Sale' },
    { value: 'networkTerminal', label: 'Network Point of Sale Terminal' },
    { value: 'networkServer', label: 'Network Point of Sale Server' }
  ];

  const networkFieldsWrap = el('div', {});

  function renderNetworkFields() {
    networkFieldsWrap.innerHTML = '';
    if (values.applicationType === 'networkTerminal') {
      networkFieldsWrap.appendChild(textField('networkServerAddress', 'Network POS Server Address', 'e.g. http://192.168.1.10:4000'));
      networkFieldsWrap.appendChild(el('p', { class: 'settings-hint' }, 'The address of the machine running this store as a Network POS Server, that this till connects to.'));
    } else if (values.applicationType === 'networkServer') {
      networkFieldsWrap.appendChild(numberField('networkServerPort', 'Server Port'));
      networkFieldsWrap.appendChild(el('p', { class: 'settings-hint' }, 'The port other tills on this network connect to when set up as a Network POS Terminal.'));
    }
  }

  const appTypeSelect = el('select', {
    onChange: (e) => { values.applicationType = e.target.value; renderNetworkFields(); }
  }, APPLICATION_TYPES.map((t) => el('option', { value: t.value }, t.label)));
  appTypeSelect.value = values.applicationType || 'standalone';

  const IDLE_LOCK_OPTIONS = [
    { value: 0, label: 'Off' },
    { value: 5, label: '5 minutes' },
    { value: 10, label: '10 minutes' },
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' }
  ];
  const idleLockSelect = el('select', {
    onChange: (e) => { values.idleLockMinutes = Number(e.target.value); }
  }, IDLE_LOCK_OPTIONS.map((o) => el('option', { value: String(o.value) }, o.label)));
  idleLockSelect.value = String(values.idleLockMinutes ?? 5);

  const applicationSection = el('div', { class: 'settings-section' }, [
    el('h4', {}, 'Application'),
    el('div', { class: 'form-field' }, [el('label', {}, 'Application Type'), appTypeSelect]),
    networkFieldsWrap,
    el('div', { class: 'form-field' }, [el('label', {}, 'Lock App After Inactivity'), idleLockSelect]),
    el('p', { class: 'settings-hint' }, 'Locks the app behind a password prompt after this many minutes of no activity. Set to Off to disable.')
  ]);
  renderNetworkFields();

  // --- Logo upload ---
  // Reuses the same /api/uploads/image endpoint (multer-backed, 2MB
  // cap, jpeg/png/webp only) as the product form's Picture field --
  // see assets/js/modules/products/product-form.js#uploadImage.
  async function uploadLogo(file) {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/uploads/image', { method: 'POST', body: formData });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((data && data.error) || 'Logo upload failed.');
    }
    return data.url;
  }

  const logoPreview = el('img', {
    src: values.logoUrl || '',
    style: `display:${values.logoUrl ? 'block' : 'none'}; max-height:80px; max-width:200px; margin-bottom:0.5rem; border-radius:4px; border:1px solid var(--color-border);`
  });
  const logoStatus = el('span', { class: 'settings-hint', style: 'margin-left:0.5rem;' }, '');
  const logoInput = el('input', {
    type: 'file',
    accept: 'image/jpeg,image/jpg,image/png,image/webp',
    onChange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      logoStatus.textContent = 'Uploading\u2026';
      try {
        const url = await uploadLogo(file);
        values.logoUrl = url;
        logoPreview.src = url;
        logoPreview.style.display = 'block';
        logoStatus.textContent = '';
      } catch (err) {
        logoStatus.textContent = '';
        notification.error(err.message);
        e.target.value = '';
      }
    }
  });
  const removeLogoBtn = el('button', {
    class: 'btn btn-sm btn-secondary',
    type: 'button',
    onClick: () => {
      values.logoUrl = '';
      logoPreview.src = '';
      logoPreview.style.display = 'none';
      logoInput.value = '';
    }
  }, 'Remove Logo');

  const logoSection = el('div', { class: 'settings-section' }, [
    el('h4', {}, 'Logo'),
    logoPreview,
    el('div', { class: 'form-field' }, [logoInput, logoStatus]),
    el('p', { class: 'settings-hint' }, 'Max filesize: 2MB; Allowed image types: jpeg, jpg, png or webp.'),
    removeLogoBtn
  ]);

  const form = el('div', { class: 'store-profile-form' }, [
    applicationSection,
    logoSection,
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
      return el('div', { class: 'form-field' }, [
        el('label', {}, 'Receipt Footer'),
        textarea,
        el('p', { class: 'settings-hint' }, 'A short note printed at the bottom of every receipt \u2014 e.g. a thank-you message, return policy, or store hours.')
      ]);
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
