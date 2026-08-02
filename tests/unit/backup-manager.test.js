// tests/unit/backup-manager.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const BackupManager = require('../../core/backup-manager');
const { applyPendingRestoreIfAny } = require('../../core/backup-manager');
const ProductManager = require('../../core/product-manager');
const storeConfig = require('../../core/store-config');

describe('BackupManager', () => {
  let root, dataDir, backupManager;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yourshopapp-backup-test-'));
    dataDir = path.join(root, 'store');
    fs.mkdirSync(dataDir, { recursive: true });
    storeConfig.setStoreType('generalRetail');
    backupManager = new BackupManager(dataDir);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('getSettings returns sane defaults', async () => {
    const settings = await backupManager.getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.frequency).toBe('daily');
    expect(settings.retentionCount).toBe(14);
  });

  test('updateSettings persists changes', async () => {
    await backupManager.updateSettings({ retentionCount: 3, frequency: 'weekly' });
    const settings = await backupManager.getSettings();
    expect(settings.retentionCount).toBe(3);
    expect(settings.frequency).toBe('weekly');
  });

  test('createBackup copies the data directory into a sibling backups folder', async () => {
    const productManager = new ProductManager(dataDir);
    await productManager.create({ name: 'Widget', sku: 'W-1', price: 5, stock: 10 });

    const backup = await backupManager.createBackup();
    expect(fs.existsSync(backup.path)).toBe(true);
    expect(fs.existsSync(path.join(backup.path, 'products.nedb'))).toBe(true);

    const settings = await backupManager.getSettings();
    expect(settings.lastBackupStatus).toBe('success');
    expect(settings.lastBackupAt).toBeTruthy();
  });

  test('listBackups returns newest first', async () => {
    const first = await backupManager.createBackup();
    await new Promise((r) => setTimeout(r, 10));
    const second = await backupManager.createBackup();

    const backups = await backupManager.listBackups();
    expect(backups.map((b) => b.name)).toEqual([second.name, first.name]);
  });

  test('pruneOldBackups keeps only retentionCount most recent backups', async () => {
    await backupManager.updateSettings({ retentionCount: 2 });
    await backupManager.createBackup();
    await new Promise((r) => setTimeout(r, 10));
    await backupManager.createBackup();
    await new Promise((r) => setTimeout(r, 10));
    await backupManager.createBackup(); // creates + prunes automatically

    const backups = await backupManager.listBackups();
    expect(backups).toHaveLength(2);
  });

  test('deleteBackup removes a specific backup', async () => {
    const backup = await backupManager.createBackup();
    const removed = await backupManager.deleteBackup(backup.name);
    expect(removed).toBe(true);
    expect(fs.existsSync(backup.path)).toBe(false);
  });

  test('requestRestore does NOT change dataDir immediately -- it only stages a marker', async () => {
    const productManager = new ProductManager(dataDir);
    await productManager.create({ name: 'Original', sku: 'ORIG-1', price: 1, stock: 1 });
    const backup = await backupManager.createBackup();

    await productManager.create({ name: 'Added After Backup', sku: 'NEW-1', price: 2, stock: 2 });

    await backupManager.requestRestore(backup.name);

    // Data should be untouched right now -- restore only applies on next startup.
    const productsStillThere = await productManager.list();
    expect(productsStillThere.some((p) => p.sku === 'NEW-1')).toBe(true);

    const markerPath = path.join(dataDir, '..', '.pending-restore');
    expect(fs.existsSync(markerPath)).toBe(true);
    expect(fs.readFileSync(markerPath, 'utf8').trim()).toBe(backup.name);
  });

  test('requestRestore rejects a backup name that does not exist', async () => {
    await expect(backupManager.requestRestore('backup-does-not-exist')).rejects.toThrow('not found');
  });

  test('applyPendingRestoreIfAny is a no-op when there is no pending restore', () => {
    const result = applyPendingRestoreIfAny(dataDir);
    expect(result).toBeNull();
  });

  test('applyPendingRestoreIfAny actually restores data and clears the marker', async () => {
    const productManager = new ProductManager(dataDir);
    await productManager.create({ name: 'Keep Me', sku: 'KEEP-1', price: 1, stock: 1 });
    const backup = await backupManager.createBackup();

    await productManager.create({ name: 'Should Disappear', sku: 'GONE-1', price: 2, stock: 2 });
    await backupManager.requestRestore(backup.name);

    const result = applyPendingRestoreIfAny(dataDir);
    expect(result.restored).toBe(backup.name);

    // Marker should be cleared so it isn't re-applied on a future boot.
    const markerPath = path.join(dataDir, '..', '.pending-restore');
    expect(fs.existsSync(markerPath)).toBe(false);

    // A fresh ProductManager instance reads the restored files from disk.
    const freshProductManager = new ProductManager(dataDir);
    const restoredProducts = await freshProductManager.list();
    expect(restoredProducts.some((p) => p.sku === 'KEEP-1')).toBe(true);
    expect(restoredProducts.some((p) => p.sku === 'GONE-1')).toBe(false);
  });

  test('applyPendingRestoreIfAny saves a pre-restore safety snapshot', async () => {
    const productManager = new ProductManager(dataDir);
    await productManager.create({ name: 'A', sku: 'A-1', price: 1, stock: 1 });
    const backup = await backupManager.createBackup();
    await backupManager.requestRestore(backup.name);

    const result = applyPendingRestoreIfAny(dataDir);
    const safetyPath = path.join(dataDir, '..', 'backups', result.safetyBackup);
    expect(fs.existsSync(safetyPath)).toBe(true);
  });
});
