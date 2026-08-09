// api/tally.js
// Tally integration endpoints: settings, a connection test, running a
// sync for a date range, and a plain XML download (fallback for when
// direct POST sync isn't reachable -- e.g. Tally on a different
// machine than expected, or its gateway isn't enabled -- the XML can
// still be manually imported into Tally via Import Data > Vouchers).

const express = require('express');
const { requirePermission } = require('./auth-middleware');
const { buildSyncXml, sendToTally } = require('../core/tally-sync');
const SqliteStore = require('../core/sqlite-store');

function buildTallyRouter({ tallySettings, transactionManager, dataDir }) {
  const router = express.Router();
  const customersDb = new SqliteStore(dataDir, 'customers');

  router.get('/settings', requirePermission('perm_settings'), async (req, res) => {
    res.json(await tallySettings.get());
  });

  router.put('/settings', requirePermission('perm_settings'), async (req, res) => {
    res.json(await tallySettings.update(req.body));
  });

  // POST /api/tally/test-connection -- sends an empty-but-valid
  // envelope just to confirm Tally responds at all, without creating
  // any voucher.
  router.post('/test-connection', requirePermission('perm_settings'), async (req, res) => {
    try {
      const settings = req.body?.host ? { ...(await tallySettings.get()), ...req.body } : await tallySettings.get();
      if (!settings.companyName) {
        return res.status(400).json({ error: 'Set the Company Name (must match Tally exactly) before testing.' });
      }
      const xml = buildSyncXml([], settings);
      await sendToTally(xml, settings);
      res.json({ ok: true, message: `Connected to Tally at ${settings.host}:${settings.port}.` });
    } catch (err) {
      res.status(502).json({ ok: false, error: err.message });
    }
  });

  async function collectTransactionsAndCustomerNames({ from, to }) {
    const settings = await tallySettings.get();
    const alreadySynced = new Set(settings.lastSyncedTransactionIds || []);
    const all = await transactionManager.list({ from, to, status: 'completed' });
    const transactions = all.filter((t) => !alreadySynced.has(t.id));

    const customerIds = [...new Set(transactions.map((t) => t.customerId).filter(Boolean))];
    const customerNameById = {};
    for (const id of customerIds) {
      const c = await customersDb.findById(id);
      if (c) customerNameById[id] = c.name;
    }
    return { settings, transactions, customerNameById };
  }

  // POST /api/tally/sync  { from?, to? } -- defaults to today.
  router.post('/sync', requirePermission('perm_settings'), async (req, res) => {
    try {
      const { from, to } = req.body || {};
      const range = from && to ? { from, to } : todayRange();
      const { settings, transactions, customerNameById } = await collectTransactionsAndCustomerNames(range);

      if (!settings.enabled) {
        return res.status(400).json({ error: 'Tally sync is turned off. Enable it in Settings \u2192 Tally Integration.' });
      }
      if (!settings.companyName) {
        return res.status(400).json({ error: 'Set the Company Name (must match Tally exactly) first.' });
      }
      if (!transactions.length) {
        return res.json({ synced: 0, message: 'Nothing new to sync in this range.' });
      }

      const xml = buildSyncXml(transactions, settings, customerNameById);
      await sendToTally(xml, settings);
      const syncedIds = transactions.map((t) => t.id);
      await tallySettings.markSyncResult({ status: 'success', message: `Synced ${transactions.length} voucher(s).`, syncedIds });
      res.json({ synced: transactions.length, message: `Synced ${transactions.length} voucher(s) to Tally.` });
    } catch (err) {
      await tallySettings.markSyncResult({ status: 'error', message: err.message });
      res.status(502).json({ error: err.message });
    }
  });

  // GET /api/tally/export?from=&to= -- downloads the XML instead of
  // POSTing it, for manual import into Tally (Gateway of Tally >
  // Import Data > Vouchers) when direct sync isn't set up/reachable.
  // Does NOT mark anything as synced, since it's not confirmed delivered.
  router.get('/export', requirePermission('perm_settings'), async (req, res) => {
    try {
      const { from, to } = req.query;
      const range = from && to ? { from, to } : todayRange();
      const settings = await tallySettings.get();
      if (!settings.companyName) {
        return res.status(400).json({ error: 'Set the Company Name (must match Tally exactly) first.' });
      }
      const transactions = await transactionManager.list({ ...range, status: 'completed' });
      const customerIds = [...new Set(transactions.map((t) => t.customerId).filter(Boolean))];
      const customerNameById = {};
      for (const id of customerIds) {
        const c = await customersDb.findById(id);
        if (c) customerNameById[id] = c.name;
      }
      const xml = buildSyncXml(transactions, settings, customerNameById);
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="tally-export-${new Date().toISOString().slice(0, 10)}.xml"`);
      res.send(xml);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

function todayRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
  return { from, to };
}

module.exports = buildTallyRouter;
