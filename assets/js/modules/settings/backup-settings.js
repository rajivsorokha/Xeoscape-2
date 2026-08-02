// assets/js/modules/settings/backup-settings.js
// "Data Backups" section: back up now, view backup history (download,
// restore, delete each), and configure automatic backup scheduling.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import notification from '../../ui/notification.js';

function formatDateTime(iso) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString();
}

export async function mountBackupSettings(container) {
  container.appendChild(el('h3', { style: 'margin-top:1.5rem;' }, 'Data Backups'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'Backups are full copies of your store data, kept alongside it on this computer. ' +
    'Download a backup periodically to keep an off-machine copy safe.'
  ));

  const statusBox = el('div', { class: 'backup-status-box' }, 'Loading...');
  const historyBox = el('div', { class: 'backup-history-box' });

  const backupNowBtn = el('button', {
    class: 'btn btn-primary',
    onClick: async () => {
      backupNowBtn.disabled = true;
      backupNowBtn.textContent = 'Backing up...';
      try {
        await apiClient.post('/backups', {});
        notification.success('Backup created.');
        await refresh();
      } catch (err) {
        notification.error(`Backup failed: ${err.message}`);
      } finally {
        backupNowBtn.disabled = false;
        backupNowBtn.textContent = '\ud83d\udcbe Back Up Now';
      }
    }
  }, '\ud83d\udcbe Back Up Now');

  container.appendChild(statusBox);
  container.appendChild(backupNowBtn);
  container.appendChild(historyBox);

  // --- Scheduling settings ---
  const settings = await apiClient.get('/backups/settings');
  const values = { ...settings };

  const enabledCheckbox = el('input', {
    type: 'checkbox',
    checked: values.enabled,
    onChange: (e) => { values.enabled = e.target.checked; }
  });

  const frequencySelect = el('select', {
    onChange: (e) => { values.frequency = e.target.value; }
  }, ['daily', 'weekly'].map((f) => el('option', { value: f }, f.charAt(0).toUpperCase() + f.slice(1))));
  frequencySelect.value = values.frequency || 'daily';

  const retentionInput = el('input', {
    type: 'number',
    min: '1',
    value: values.retentionCount,
    onInput: (e) => { values.retentionCount = Number(e.target.value); }
  });

  const scheduleForm = el('div', { class: 'backup-schedule-form', style: 'margin-top:1rem;' }, [
    el('div', { class: 'form-field' }, [el('label', { class: 'perm-checkbox' }, [enabledCheckbox, ' Enable automatic backups'])]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Frequency'), frequencySelect]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Keep this many backups'), retentionInput]),
    el('button', {
      class: 'btn btn-secondary',
      onClick: async () => {
        try {
          await apiClient.put('/backups/settings', values);
          notification.success('Backup settings saved.');
          await refresh();
        } catch (err) {
          notification.error(err.message);
        }
      }
    }, 'Save Backup Settings')
  ]);
  container.appendChild(scheduleForm);

  async function refresh() {
    try {
      const [currentSettings, backups] = await Promise.all([
        apiClient.get('/backups/settings'),
        apiClient.get('/backups')
      ]);

      statusBox.innerHTML = '';
      statusBox.appendChild(el('div', {}, [
        el('div', {}, `Last backup: ${formatDateTime(currentSettings.lastBackupAt)}${currentSettings.lastBackupStatus ? ` (${currentSettings.lastBackupStatus})` : ''}`),
        el('div', {}, `Automatic backups: ${currentSettings.enabled ? `on, ${currentSettings.frequency}` : 'off'}`)
      ]));

      historyBox.innerHTML = '';
      if (backups.length === 0) {
        historyBox.appendChild(el('div', { class: 'backup-history-empty' }, 'No backups yet.'));
        return;
      }

      historyBox.appendChild(el('table', { class: 'backup-history-table' }, [
        el('thead', {}, el('tr', {}, [el('th', {}, 'Created'), el('th', {}, 'Actions')])),
        el('tbody', {}, backups.map((b) => el('tr', {}, [
          el('td', {}, formatDateTime(b.createdAt)),
          el('td', { class: 'backup-actions' }, [
            el('button', {
              class: 'btn btn-sm btn-secondary',
              onClick: () => apiClient.downloadFile(`/backups/${b.name}/download`, `${b.name}.zip`)
            }, 'Download'),
            el('button', {
              class: 'btn btn-sm btn-secondary',
              onClick: async () => {
                if (!window.confirm(`Restore "${b.name}"? This will take effect the next time the app is restarted, and your current data will be safety-backed-up first.`)) return;
                try {
                  const result = await apiClient.post(`/backups/${b.name}/restore`, {});
                  notification.success(result.message);
                } catch (err) {
                  notification.error(err.message);
                }
              }
            }, 'Restore'),
            el('button', {
              class: 'btn btn-sm btn-danger',
              onClick: async () => {
                if (!window.confirm(`Delete backup "${b.name}"? This cannot be undone.`)) return;
                try {
                  await apiClient.delete(`/backups/${b.name}`);
                  await refresh();
                } catch (err) {
                  notification.error(err.message);
                }
              }
            }, 'Delete')
          ])
        ])))
      ]));
    } catch (err) {
      notification.error(`Failed to load backups: ${err.message}`);
    }
  }

  await refresh();
}
