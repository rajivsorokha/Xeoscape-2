// assets/js/modules/settings/store-type-config.js
// Lets an admin switch the active store type, which requires entering
// the activation key for the selected type.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import notification from '../../ui/notification.js';

export async function mountStoreTypeConfig(container, { onChanged } = {}) {
  container.appendChild(el('h3', {}, 'Store Type'));

  const select = el('select', {});
  const applyBtn = el('button', { class: 'btn btn-primary' }, 'Apply');
  container.appendChild(el('div', { class: 'store-type-picker' }, [select, applyBtn]));
  const descEl = el('p', { class: 'store-type-description' }, '');
  container.appendChild(descEl);

  const keyInput = el('input', {
    type: 'text',
    placeholder: 'Enter activation key for this store type'
  });
  const keyInputContainer = el('div', { class: 'store-type-key-field', style: 'display:none;margin-top:8px' }, [
    el('label', { style: 'display:block;margin-bottom:4px;font-weight:600' }, 'Activation Key:'),
    keyInput
  ]);
  container.appendChild(keyInputContainer);

  const [storeTypes, currentSettings, activationStatus] = await Promise.all([
    apiClient.get('/settings/store-types'),
    apiClient.get('/settings'),
    apiClient.get('/activation/status')
  ]);

  const activeStoreTypeId = activationStatus.storeType || currentSettings.storeType.id;

  storeTypes.forEach((st) => {
    const isActive = st.id === activeStoreTypeId;
    const opt = el('option', { value: st.id, disabled: isActive },
      isActive ? `${st.label} (Active)` : st.label
    );
    select.appendChild(opt);
  });
  select.value = currentSettings.storeType.id;

  function updateDescription() {
    const current = storeTypes.find((st) => st.id === select.value);
    descEl.textContent = current ? current.description : '';
    const isDifferent = select.value !== activeStoreTypeId;
    keyInputContainer.style.display = isDifferent ? 'block' : 'none';
    if (!isDifferent) keyInput.value = '';
  }
  select.addEventListener('change', updateDescription);
  updateDescription();

  applyBtn.addEventListener('click', async () => {
    const selectedType = select.value;
    if (selectedType === activeStoreTypeId) {
      notification.info('This store type is already active.');
      return;
    }
    const key = keyInput.value.trim();
    if (!key) {
      notification.error('Please enter the activation key for the selected store type.');
      return;
    }
    try {
      await apiClient.post('/activation/activate', { activationKey: key });
      notification.success('Store type updated. Product fields will now reflect this store type.');
      await onChanged?.();
    } catch (err) {
      notification.error(err.message);
    }
  });
}
