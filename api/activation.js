// api/activation.js
// Activation status/activate endpoints. The app requires a valid
// per-store-type activation key before the frontend will show the main
// application (see assets/js/core/activation-gate.js).

const express = require('express');

function buildActivationRouter({ activation }) {
  const router = express.Router();

  router.get('/status', async (req, res) => {
    res.json(await activation.getStatus());
  });

  router.post('/activate', async (req, res) => {
    try {
      const { activationKey } = req.body;
      const result = await activation.activate(activationKey);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Admin-only in spirit -- lets a store reset and re-activate as a
  // different store type. Not permission-gated at the API layer since
  // this app doesn't have server-side session auth; the frontend only
  // exposes this from within the logged-in Settings screen.
  router.post('/deactivate', async (req, res) => {
    res.json(await activation.deactivate());
  });

  return router;
}

module.exports = buildActivationRouter;
