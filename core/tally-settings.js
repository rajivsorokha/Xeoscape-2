// core/tally-settings.js
// Configuration for syncing sales/tax/payment data to Tally
// (Prime/ERP9) via its XML import gateway. Tally listens for XML on a
// local HTTP port on the SAME machine it's running on (classic
// default is 9000) once its "ODBC Server"/HTTP-XML gateway is enabled
// via F12 -> Advanced Configuration -> Client/Server configuration in
// Tally itself -- that has to be turned on in Tally for any of this
// to reach it. Persisted the same way as core/email-settings.js.

const SqliteStore = require('./sqlite-store');

const DEFAULT_TALLY_SETTINGS = {
  enabled: false,
  host: 'localhost',
  port: 9000,
  companyName: '', // must exactly match the company name as loaded in Tally
  // GST type: 'intrastate' splits tax evenly into CGST+SGST ledgers,
  // 'interstate' puts the full tax amount into the IGST ledger.
  gstType: 'intrastate',
  salesLedgerName: 'Sales Account',
  cgstLedgerName: 'CGST',
  sgstLedgerName: 'SGST',
  igstLedgerName: 'IGST',
  cashLedgerName: 'Cash',
  cardLedgerName: 'Bank Account',
  autoSyncEnabled: false,
  autoSyncTime: '23:30', // HH:mm, local time, used when autoSyncEnabled
  lastSyncAt: null,
  lastSyncStatus: null, // 'success' | 'error' | null
  lastSyncMessage: null,
  lastSyncedTransactionIds: [] // guards against double-syncing the same sale on repeated/overlapping runs
};

class TallySettings {
  constructor(dataDir) {
    this.db = new SqliteStore(dataDir, 'tally_settings');
  }

  async get() {
    const records = await this.db.readAll();
    return { ...DEFAULT_TALLY_SETTINGS, ...(records[0] || {}) };
  }

  async update(patch) {
    const current = await this.get();
    const next = { ...current, ...patch };
    await this.db.writeAll([next]);
    return next;
  }

  async markSyncResult({ status, message, syncedIds = [] }) {
    const current = await this.get();
    const mergedIds = Array.from(new Set([...(current.lastSyncedTransactionIds || []), ...syncedIds]));
    // Keep this list from growing forever -- only the most recent
    // 2000 synced ids are needed to guard against re-syncing very
    // recent transactions; older ones are outside any realistic sync
    // window anyway.
    const trimmedIds = mergedIds.slice(-2000);
    return this.update({
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: status,
      lastSyncMessage: message,
      lastSyncedTransactionIds: trimmedIds
    });
  }
}

module.exports = TallySettings;
module.exports.DEFAULT_TALLY_SETTINGS = DEFAULT_TALLY_SETTINGS;
