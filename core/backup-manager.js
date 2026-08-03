// core/backup-manager.js
// Auto data-backup system. Since all persisted data lives in one
// store.sqlite file (plus a couple of small JSON config files)
// directly under dataDir, a "backup" is simply a full copy of that
// directory into a timestamped folder under <dataDir>/../backups --
// kept as a sibling, not inside dataDir itself, so backups never back
// up other backups.
//
// Backups can be created manually (see api/backups.js) or automatically
// on a schedule (core/backup-scheduler.js). Old backups beyond the
// configured retention count are pruned automatically after each run.
//
// RESTORE DESIGN NOTE: while the app is running, store.sqlite is held
// open via a long-lived connection (see core/sqlite-store.js) --
// swapping the underlying file on disk while that connection is open
// wouldn't actually change what the running app sees (stale WAL
// state), and on Windows can outright fail with a file-in-use error,
// which this project has hit repeatedly with exactly this kind of
// live file replacement. So a restore is NOT applied immediately:
// requestRestore() just writes a small marker file recording which
// backup was chosen. On the next app startup, applyPendingRestoreIfAny()
// -- called before any SqliteStore is constructed, and which also
// closes any same-process cached connection for dataDir first --
// performs the actual file swap while nothing has the data file open,
// then deletes the marker. The API layer tells the user a restart is
// required, same as a database restore in most real applications.

const fs = require('fs');
const path = require('path');
const SqliteStore = require('./sqlite-store');

const DEFAULT_BACKUP_SETTINGS = {
  enabled: true,
  frequency: 'daily', // 'daily' | 'weekly'
  retentionCount: 14,
  lastBackupAt: null,
  lastBackupStatus: null // 'success' | 'failed'
};

function backupsDirFor(dataDir) {
  return path.join(dataDir, '..', 'backups');
}

function pendingRestoreMarkerFor(dataDir) {
  return path.join(dataDir, '..', '.pending-restore');
}

/**
 * Must be called BEFORE any SqliteStore/manager touches dataDir (i.e.
 * right at the top of server startup). If a restore was requested via
 * requestRestore() on a previous run, performs it now and clears the
 * marker. Safe to call unconditionally on every startup -- it's a
 * no-op when there's no pending restore.
 */
function applyPendingRestoreIfAny(dataDir) {
  const markerPath = pendingRestoreMarkerFor(dataDir);
  if (!fs.existsSync(markerPath)) return null;

  const backupName = fs.readFileSync(markerPath, 'utf8').trim();
  const backupPath = path.join(backupsDirFor(dataDir), backupName);
  fs.unlinkSync(markerPath);

  // Must happen before any fs mutation below -- see the note on
  // closeConnectionsUnder() in core/sqlite-store.js.
  SqliteStore.closeConnectionsUnder(dataDir);

  if (!backupName || !fs.existsSync(backupPath)) {
    console.error(`Pending restore marker pointed at missing backup "${backupName}" -- skipping restore.`);
    return null;
  }

  const backupsDir = backupsDirFor(dataDir);
  const safetyName = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (fs.existsSync(dataDir)) {
    fs.cpSync(dataDir, path.join(backupsDir, safetyName), { recursive: true });
    fs.readdirSync(dataDir).forEach((entry) => {
      fs.rmSync(path.join(dataDir, entry), { recursive: true, force: true });
    });
  } else {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.cpSync(backupPath, dataDir, { recursive: true });

  console.log(`Restored data from backup "${backupName}" (pre-restore snapshot saved as "${safetyName}").`);
  return { restored: backupName, safetyBackup: safetyName };
}

class BackupManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.backupsDir = backupsDirFor(dataDir);
    this.settingsDb = new SqliteStore(dataDir, 'backup_settings');
  }

  async getSettings() {
    const records = await this.settingsDb.readAll();
    return { ...DEFAULT_BACKUP_SETTINGS, ...(records[0] || {}) };
  }

  async updateSettings(patch) {
    const current = await this.getSettings();
    const next = { ...current, ...patch };
    await this.settingsDb.writeAll([next]);
    return next;
  }

  /** Creates a new backup folder (a full copy of dataDir) and prunes old ones per retentionCount. */
  async createBackup() {
    if (!fs.existsSync(this.backupsDir)) fs.mkdirSync(this.backupsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${timestamp}`;
    const backupPath = path.join(this.backupsDir, backupName);

    try {
      fs.cpSync(this.dataDir, backupPath, {
        recursive: true,
        filter: (src) => path.resolve(src) !== path.resolve(this.backupsDir)
      });
      await this.updateSettings({ lastBackupAt: new Date().toISOString(), lastBackupStatus: 'success' });
      await this.pruneOldBackups();
      return { name: backupName, path: backupPath, createdAt: new Date().toISOString() };
    } catch (err) {
      await this.updateSettings({ lastBackupAt: new Date().toISOString(), lastBackupStatus: 'failed' });
      throw err;
    }
  }

  async listBackups() {
    if (!fs.existsSync(this.backupsDir)) return [];
    const entries = fs.readdirSync(this.backupsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('backup-'))
      .map((e) => {
        const stat = fs.statSync(path.join(this.backupsDir, e.name));
        return { name: e.name, createdAt: stat.mtime.toISOString() };
      });
    return entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async pruneOldBackups() {
    const { retentionCount } = await this.getSettings();
    const backups = await this.listBackups();
    const toDelete = backups.slice(retentionCount);
    toDelete.forEach((b) => {
      fs.rmSync(path.join(this.backupsDir, b.name), { recursive: true, force: true });
    });
    return toDelete.length;
  }

  /**
   * Records which backup to restore on next startup -- see the design
   * note at the top of this file for why it isn't applied immediately.
   */
  async requestRestore(backupName) {
    const backupPath = path.join(this.backupsDir, backupName);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup "${backupName}" not found.`);
    }
    fs.writeFileSync(pendingRestoreMarkerFor(this.dataDir), backupName, 'utf8');
    return { pending: true, backupName };
  }

  async deleteBackup(backupName) {
    const backupPath = path.join(this.backupsDir, backupName);
    if (!fs.existsSync(backupPath)) return false;
    fs.rmSync(backupPath, { recursive: true, force: true });
    return true;
  }

  /** Streams a backup folder as a downloadable .zip to an Express response. */
  zipBackupTo(backupName, res) {
    // Pinned to archiver@7.x deliberately: v8 is an ESM-only rewrite
    // with a completely different class-based API (ZipArchive, etc.)
    // instead of the classic archiver('zip', opts) factory function.
    const archiver = require('archiver');
    const backupPath = path.join(this.backupsDir, backupName);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup "${backupName}" not found.`);
    }
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => res.status(500).end(String(err)));
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${backupName}.zip"`);
    archive.pipe(res);
    archive.directory(backupPath, false);
    archive.finalize();
  }
}

module.exports = BackupManager;
module.exports.applyPendingRestoreIfAny = applyPendingRestoreIfAny;
