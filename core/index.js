// core/index.js
// Wires up the core managers with a shared data directory and exposes a
// single factory so API routes (and tests) can get consistent instances.

const path = require('path');
const storeConfig = require('./store-config');
const ProductManager = require('./product-manager');
const InventoryManager = require('./inventory-manager');
const TransactionManager = require('./transaction-manager');
const ReportGenerator = require('./report-generator');
const StoreProfile = require('./store-profile');
const EmailSettings = require('./email-settings');
const Activation = require('./activation');
const BackupManager = require('./backup-manager');
const { applyPendingRestoreIfAny } = require('./backup-manager');

function createCore(dataDir = path.join(__dirname, '..', 'data', 'store')) {
  // Must run before any NedbStore/manager below opens a file in
  // dataDir -- see the design note in core/backup-manager.js.
  applyPendingRestoreIfAny(dataDir);

  storeConfig.configureDataDir(dataDir);

  const productManager = new ProductManager(dataDir);
  const inventoryManager = new InventoryManager(dataDir, productManager);
  const transactionManager = new TransactionManager(dataDir, productManager, inventoryManager);
  const reportGenerator = new ReportGenerator(transactionManager, productManager, inventoryManager);
  const storeProfile = new StoreProfile(dataDir);
  const emailSettings = new EmailSettings(dataDir);
  const activation = new Activation(dataDir);
  const backupManager = new BackupManager(dataDir);

  return {
    storeConfig,
    productManager,
    inventoryManager,
    transactionManager,
    reportGenerator,
    storeProfile,
    emailSettings,
    activation,
    backupManager
  };
}

module.exports = { createCore };
