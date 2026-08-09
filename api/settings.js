// api/settings.js
// Store settings, including selecting/inspecting the active store type.

const express = require('express');
const appConfig = require('../app.config');
const { requirePermission } = require('./auth-middleware');

function buildSettingsRouter({ storeConfig, storeProfile, emailSettings, aiSettings }) {
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

  // Switching the active store type changes which product/category
  // catalog the whole terminal shows (see core/product-manager.js) --
  // a disruptive, store-wide action, so it's admin-gated.
  router.post('/store-type', requirePermission('perm_settings'), (req, res) => {
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
  // Logo images are uploaded separately via POST /api/uploads/image
  // (see api/uploads.js -- multer-backed, 2MB cap, jpeg/png/webp only);
  // this endpoint just stores the resulting URL like any other field.
  // GET stays open to every logged-in user (not perm_settings-gated):
  // the POS itself needs currency symbol/tax rate/receipt footer to
  // function for every role, not just admins.
  router.get('/profile', async (req, res) => {
    res.json(await storeProfile.get());
  });

  router.put('/profile', requirePermission('perm_settings'), async (req, res) => {
    res.json(await storeProfile.update(req.body));
  });

  // Email/SMTP settings for report automation. Password is redacted on
  // read so it never round-trips back to the client in plain text.
  router.get('/email', requirePermission('perm_settings'), async (req, res) => {
    const { smtpPass, ...safe } = await emailSettings.get();
    res.json({ ...safe, smtpPassSet: Boolean(smtpPass) });
  });

  router.put('/email', requirePermission('perm_settings'), async (req, res) => {
    const updated = await emailSettings.update(req.body);
    const { smtpPass, ...safe } = updated;
    res.json({ ...safe, smtpPassSet: Boolean(smtpPass) });
  });

  // AI assistant settings: active provider (Anthropic/Groq/Google AI
  // Studio/OpenRouter) plus a saved apiKey/model per provider. Keys
  // are redacted on read (apiKeySet per provider instead), same
  // pattern as /email above.
  function redactAi(settings) {
    const providers = {};
    for (const [name, cfg] of Object.entries(settings.providers)) {
      providers[name] = { model: cfg.model, apiKeySet: Boolean(cfg.apiKey) };
    }
    return { enabled: settings.enabled, provider: settings.provider, providers };
  }

  router.get('/ai', requirePermission('perm_settings'), async (req, res) => {
    res.json(redactAi(await aiSettings.get()));
  });

  router.put('/ai', requirePermission('perm_settings'), async (req, res) => {
    const updated = await aiSettings.update(req.body);
    res.json(redactAi(updated));
  });

  router.get('/permissions/:role', (req, res) => {
    res.json({ role: req.params.role, permissions: storeConfig.getRolePermissions(req.params.role) });
  });

  return router;
}

module.exports = buildSettingsRouter;
