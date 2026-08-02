// core/backup-scheduler.js
// Registers a daily cron job that creates an automatic data backup.
// Always registered; checks the current backup settings at fire-time
// so enabling/disabling or changing frequency via the UI takes effect
// immediately without a server restart (same pattern as
// report-scheduler.js).

const cron = require('node-cron');

function startBackupScheduler({ backupManager }) {
  // Runs once a day; "weekly" is handled by only actually backing up
  // on Mondays when that frequency is selected, same day/time as the
  // weekly report email for consistency.
  const task = cron.schedule('30 2 * * *', async () => {
    try {
      const settings = await backupManager.getSettings();
      if (!settings.enabled) return;

      const isMonday = new Date().getDay() === 1;
      if (settings.frequency === 'weekly' && !isMonday) return;

      await backupManager.createBackup();
      console.log('Scheduled automatic backup completed.');
    } catch (err) {
      console.error('Scheduled automatic backup failed:', err.message);
    }
  });

  return function stopBackupScheduler() {
    task.stop();
  };
}

module.exports = { startBackupScheduler };
