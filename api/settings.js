// api/settings.js
// Store settings, including selecting/inspecting the active store type.

const express = require('express');
const appConfig = require('../app.config');

function buildSettingsRouter({ storeConfig, storeProfile, emailSettings }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({
      appName: appConfig.appName,
      licensee: appConfig.licensee,
      version: appConfig.version,
      storeType: storeConfig.getCurrentStoreType()
    });
  });

  router.get('/store-types', (req, res) => {
    res.json(storeConfig.listStoreTypes());
  });

  router.post('/store-type', (req, res) => {
    try {
      const { storeType } = req.body;
      const updated = storeConfig.setStoreType(storeType);
      res.json({ storeType, ...updated });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Store profile: name, address, contact, tax settings, currency
  // symbol, receipt footer -- mirrors PharmaSpot's real Settings screen.
  router.get('/profile', async (req, res) => {
    res.json(await storeProfile.get());
  });

  router.put('/profile', async (req, res) => {
    res.json(await storeProfile.update(req.body));
  });

  // Email/SMTP settings for report automation. Password is redacted on
  // read so it never round-trips back to the client in plain text.
  router.get('/email', async (req, res) => {
    const { smtpPass, ...safe } = await emailSettings.get();
    res.json({ ...safe, smtpPassSet: Boolean(smtpPass) });
  });

  router.put('/email', async (req, res) => {
    const updated = await emailSettings.update(req.body);
    const { smtpPass, ...safe } = updated;
    res.json({ ...safe, smtpPassSet: Boolean(smtpPass) });
  });

  router.get('/permissions/:role', (req, res) => {
    res.json({ role: req.params.role, permissions: storeConfig.getRolePermissions(req.params.role) });
  });

  return router;
}

module.exports = buildSettingsRouter;
