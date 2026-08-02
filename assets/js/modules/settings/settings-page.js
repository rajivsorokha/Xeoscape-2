// assets/js/modules/settings/settings-page.js
// Full-page Settings view (like the Transactions screen -- a
// router-registered page, not a modal). A side menu lists each
// section; only the selected one is mounted into the content area at
// a time.

import { el } from '../../shared/utils.js';
import { mountStoreProfile } from './store-profile.js';
import { mountStoreTypeConfig } from './store-type-config.js';
import { mountReportGenerator } from './report-generator-settings.js';
import { mountEmailSettings } from './email-settings-panel.js';
import { mountBackupSettings } from './backup-settings.js';
import notification from '../../ui/notification.js';

const SECTIONS = [
  { id: 'store-profile', label: 'Store Profile', mount: mountStoreProfile },
  { id: 'store-type', label: 'Store Type', mount: (container, ctx) => mountStoreTypeConfig(container, { onChanged: ctx.onStoreTypeChanged }) },
  { id: 'report-generator', label: 'Report Generator', mount: mountReportGenerator },
  { id: 'send-email', label: 'Send via Email', mount: mountEmailSettings },
  { id: 'data-backups', label: 'Data Backups', mount: mountBackupSettings }
];

export async function mountSettingsPage(container, { onStoreTypeChanged } = {}) {
  let activeId = SECTIONS[0].id;

  const menu = el('nav', { class: 'settings-page-menu' },
    SECTIONS.map((section) => el('button', {
      class: `settings-page-menu-item${section.id === activeId ? ' active' : ''}`,
      onClick: () => selectSection(section.id)
    }, section.label))
  );

  const content = el('div', { class: 'settings-page-content' });

  container.appendChild(el('div', { class: 'view-header' }, [el('h2', {}, 'Settings')]));
  container.appendChild(el('div', { class: 'settings-page-layout' }, [menu, content]));

  async function selectSection(id) {
    activeId = id;
    [...menu.children].forEach((btn, i) => {
      btn.classList.toggle('active', SECTIONS[i].id === id);
    });

    const section = SECTIONS.find((s) => s.id === id);
    content.innerHTML = '';
    content.appendChild(el('div', {}, 'Loading...'));
    try {
      content.innerHTML = '';
      await section.mount(content, { onStoreTypeChanged });
    } catch (err) {
      content.innerHTML = '';
      notification.error(`Failed to load ${section.label}: ${err.message}`);
    }
  }

  await selectSection(activeId);
}
