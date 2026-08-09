// api/backups.js
// Manual backup controls and settings for the auto-backup system (see
// core/backup-manager.js). Automatic backups run on a schedule (see
// core/backup-scheduler.js); this API lets a user back up on demand,
// see backup history, download one, or restore one.

const express = require('express');
const multer = require('multer');
const { requirePermission } = require('./auth-middleware');

const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // backups are just a sqlite file, but leave generous headroom
}).single('file');

function buildBackupsRouter({ backupManager }) {
  const router = express.Router();

  router.get('/settings', async (req, res) => {
    res.json(await backupManager.getSettings());
  });

  router.put('/settings', requirePermission('perm_settings'), async (req, res) => {
    res.json(await backupManager.updateSettings(req.body));
  });

  router.get('/', async (req, res) => {
    res.json(await backupManager.listBackups());
  });

  router.post('/', requirePermission('perm_settings'), async (req, res) => {
    try {
      const backup = await backupManager.createBackup();
      res.status(201).json(backup);
    } catch (err) {
      res.status(500).json({ error: `Backup failed: ${err.message}` });
    }
  });

  router.get('/:name/download', (req, res) => {
    try {
      backupManager.zipBackupTo(req.params.name, res);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // Restore doesn't apply immediately -- see the design note at the
  // top of core/backup-manager.js. It's staged and applied on the
  // app's next startup, so the response makes that explicit.
  router.post('/:name/restore', requirePermission('perm_settings'), async (req, res) => {
    try {
      const result = await backupManager.requestRestore(req.params.name);
      res.json({
        ...result,
        message: 'Restore scheduled. Restart the application for it to take effect.'
      });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // POST /api/backups/upload-restore -- multipart 'file' field, a
  // previously-downloaded backup .zip (see GET /:name/download). For
  // the "fresh install on a wiped/new machine, restore from the zip I
  // saved somewhere safe" path, where there's no local backup history
  // to pick from yet.
  router.post('/upload-restore', requirePermission('perm_settings'), (req, res) => {
    zipUpload(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
      try {
        const result = await backupManager.importZipAndRequestRestore(req.file.buffer);
        res.json({
          ...result,
          message: 'Restore scheduled. Restart the application for it to take effect.'
        });
      } catch (parseErr) {
        res.status(400).json({ error: parseErr.message });
      }
    });
  });

  router.delete('/:name', requirePermission('perm_settings'), async (req, res) => {
    const removed = await backupManager.deleteBackup(req.params.name);
    if (!removed) return res.status(404).json({ error: 'Backup not found' });
    res.status(204).send();
  });

  return router;
}

module.exports = buildBackupsRouter;
