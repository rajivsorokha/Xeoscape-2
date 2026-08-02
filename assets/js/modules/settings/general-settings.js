// assets/js/modules/settings/general-settings.js
// Settings content: app info, store profile, and store-type picker.
// Rendered inside a modal (see settings-modal.js) rather than a full
// page, matching the real app's #settingsModal.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { mountStoreProfile } from './store-profile.js';
import { mountStoreTypeConfig } from './store-type-config.js';
import { mountReportsSettings } from './reports-settings.js';
import { mountBackupSettings } from './backup-settings.js';
import notification from '../../ui/notification.js';

export async function mountGeneralSettings(container, { onStoreTypeChanged } = {}) {
  const infoBox = el('div', { class: 'settings-info' }, 'Loading...');
  container.appendChild(infoBox);

  try {
    const settings = await apiClient.get('/settings');
    infoBox.innerHTML = '';
    infoBox.appendChild(el('div', {}, [
      el('div', {}, `App: ${settings.appName} v${settings.version}`),
      el('div', {}, `Licensed to: ${settings.licensee}`),
      el('div', {}, `Store Type: ${settings.storeType.label}`)
    ]));
  } catch (err) {
    notification.error(`Failed to load settings: ${err.message}`);
  }

  const profileSection = el('section', { class: 'settings-section' });
  const storeTypeSection = el('section', { class: 'settings-section' });
  const reportsSection = el('section', { class: 'settings-section' });
  const backupSection = el('section', { class: 'settings-section' });
  container.appendChild(profileSection);
  container.appendChild(storeTypeSection);
  container.appendChild(reportsSection);
  container.appendChild(backupSection);

  await mountStoreProfile(profileSection);
  await mountStoreTypeConfig(storeTypeSection, { onChanged: onStoreTypeChanged });
  await mountReportsSettings(reportsSection);
  await mountBackupSettings(backupSection);
}
