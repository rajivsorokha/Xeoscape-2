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
const AiSettings = require('./ai-settings');
const Activation = require('./activation');
const BackupManager = require('./backup-manager');
const PurchaseOrderManager = require('./purchase-order-manager');
const ExpenseManager = require('./expense-manager');
const TallySettings = require('./tally-settings');
const WhatsAppSettings = require('./whatsapp-settings');
const { applyPendingRestoreIfAny } = require('./backup-manager');

function createCore(dataDir = path.join(__dirname, '..', 'data', 'store')) {
  // Must run before any NedbStore/manager below opens a file in
  // dataDir -- see the design note in core/backup-manager.js.
  applyPendingRestoreIfAny(dataDir);

  storeConfig.configureDataDir(dataDir);

  const productManager = new ProductManager(dataDir);
  const inventoryManager = new InventoryManager(dataDir, productManager);
  const storeProfile = new StoreProfile(dataDir);
  const transactionManager = new TransactionManager(dataDir, productManager, inventoryManager, storeProfile);
  const reportGenerator = new ReportGenerator(transactionManager, productManager, inventoryManager, dataDir);
  const emailSettings = new EmailSettings(dataDir);
  const aiSettings = new AiSettings(dataDir);
  const activation = new Activation(dataDir);
  const backupManager = new BackupManager(dataDir);
  const purchaseOrderManager = new PurchaseOrderManager(dataDir, inventoryManager, productManager);
  const expenseManager = new ExpenseManager(dataDir, storeConfig);
  const tallySettings = new TallySettings(dataDir);
  const whatsappSettings = new WhatsAppSettings(dataDir);

  return {
    storeConfig,
    productManager,
    inventoryManager,
    transactionManager,
    reportGenerator,
    storeProfile,
    emailSettings,
    aiSettings,
    activation,
    backupManager,
    purchaseOrderManager,
    expenseManager,
    tallySettings,
    whatsappSettings
  };
}

module.exports = { createCore };
