// assets/js/modules/settings/settings-modal.js
// Opens Settings (store profile + store type) as a modal, matching the
// real app's #settingsModal instead of a full-page route.

import { el } from '../../shared/utils.js';
import modalManager from '../../ui/modal-manager.js';
import { mountGeneralSettings } from './general-settings.js';

export function openSettingsModal({ onStoreTypeChanged } = {}) {
  const content = el('div', {});
  modalManager.open({
    title: 'Settings',
    content,
    size: 'lg',
    actions: [{ label: 'Close', className: 'btn-secondary' }]
  });
  mountGeneralSettings(content, { onStoreTypeChanged });
}
