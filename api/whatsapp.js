// api/whatsapp.js
// WhatsApp credit-reminder settings and send actions. Only meaningful
// when credit / due sales are switched on for the store (Settings ->
// Store Profile -> "Allow credit / due sales"), same gate the
// due/credit payment feature itself uses -- see
// core/transaction-manager.js.

const express = require('express');
const { requirePermission } = require('./auth-middleware');
const { sendWhatsAppReminder } = require('../core/whatsapp-sender');

function buildWhatsAppRouter({ whatsappSettings, customersDb, storeProfile }) {
  const router = express.Router();

  function redact(settings) {
    const { authToken, ...safe } = settings;
    return { ...safe, authTokenSet: Boolean(authToken) };
  }

  router.get('/settings', requirePermission('perm_settings'), async (req, res) => {
    res.json(redact(await whatsappSettings.get()));
  });

  router.put('/settings', requirePermission('perm_settings'), async (req, res) => {
    const updated = await whatsappSettings.update(req.body);
    res.json(redact(updated));
  });

  async function requireCreditSales(req, res, next) {
    const profile = await storeProfile.get();
    if (!profile.creditSalesEnabled) {
      return res.status(400).json({
        error: 'WhatsApp payment reminders need credit / due sales turned on (Settings \u2192 Store Profile).'
      });
    }
    next();
  }

  // POST /api/whatsapp/send-reminder/:customerId
  router.post('/send-reminder/:customerId', requirePermission('perm_transactions'), requireCreditSales, async (req, res) => {
    try {
      const settings = await whatsappSettings.get();
      if (!settings.enabled) {
        return res.status(400).json({ error: 'WhatsApp reminders are turned off. Enable them in Settings \u2192 WhatsApp Reminders.' });
      }
      const customer = await customersDb.findById(req.params.customerId);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      if (!(customer.balance > 0)) {
        return res.status(400).json({ error: 'This customer has no outstanding balance.' });
      }

      const result = await sendWhatsAppReminder({
        settings,
        toNumber: customer.phone,
        customerName: customer.name,
        amountText: `${customer.balance.toFixed(2)}`
      });
      res.json({ sent: true, ...result });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // POST /api/whatsapp/send-reminders-bulk -- sends to every customer
  // with an outstanding balance. Best-effort: one failure doesn't
  // stop the rest, and a per-customer result list is returned so the
  // caller can see exactly who did/didn't get a reminder.
  router.post('/send-reminders-bulk', requirePermission('perm_transactions'), requireCreditSales, async (req, res) => {
    const settings = await whatsappSettings.get();
    if (!settings.enabled) {
      return res.status(400).json({ error: 'WhatsApp reminders are turned off. Enable them in Settings \u2192 WhatsApp Reminders.' });
    }
    const customers = (await customersDb.readAll()).filter((c) => c.balance > 0);
    const results = [];
    for (const customer of customers) {
      try {
        await sendWhatsAppReminder({
          settings,
          toNumber: customer.phone,
          customerName: customer.name,
          amountText: `${customer.balance.toFixed(2)}`
        });
        results.push({ customerId: customer.id, name: customer.name, sent: true });
      } catch (err) {
        results.push({ customerId: customer.id, name: customer.name, sent: false, error: err.message });
      }
    }
    res.json({ total: results.length, sent: results.filter((r) => r.sent).length, results });
  });

  return router;
}

module.exports = buildWhatsAppRouter;
