// api/reports.js
// Report generation (Today / 2 Days / Week / Month presets) and
// on-demand / scheduled email delivery of those reports.

const express = require('express');
const { resolveRange, PRESETS } = require('../core/report-ranges');
const { buildReportContent, sendReportEmail, sendTestEmail } = require('../core/report-mailer');
const { buildReportPdf } = require('../core/report-pdf');

function buildReportsRouter({ reportGenerator, storeProfile, emailSettings }) {
  const router = express.Router();

  // GET /api/reports/product-performance?range=today|2days|week|month
  // Margin/ABC/basket-penetration/slow-mover analysis -- see
  // core/report-generator.js#productPerformance for what each metric
  // does and doesn't claim.
  router.get('/product-performance', async (req, res) => {
    const { range = 'month' } = req.query;
    if (!PRESETS.includes(range)) {
      return res.status(400).json({ error: `range must be one of: ${PRESETS.join(', ')}` });
    }
    try {
      const { from, to, label } = resolveRange(range);
      const performance = await reportGenerator.productPerformance({ from, to });
      res.json({ range, label, ...performance });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/reports/inventory-movement?productId=...&range=today|2days|week|month
  // Daily stock-level + units-sold/restocked series for one product,
  // plus a simple stockout projection -- see
  // core/report-generator.js#inventoryMovement.
  router.get('/inventory-movement', async (req, res) => {
    const { productId, range = 'month' } = req.query;
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }
    if (!PRESETS.includes(range)) {
      return res.status(400).json({ error: `range must be one of: ${PRESETS.join(', ')}` });
    }
    try {
      const { from, to, label } = resolveRange(range);
      const movement = await reportGenerator.inventoryMovement({ productId, from, to });
      res.json({ range, label, ...movement });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/reports/summary?range=today|2days|week|month
  router.get('/summary', async (req, res) => {
    const { range = 'today' } = req.query;
    if (!PRESETS.includes(range)) {
      return res.status(400).json({ error: `range must be one of: ${PRESETS.join(', ')}` });
    }
    try {
      const { subject, summary, topProducts } = await buildReportContent({ range, reportGenerator, storeProfile });
      const { from, to, label } = resolveRange(range);
      res.json({ range, label, from, to, subject, summary, topProducts });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/reports/pdf?range=today|2days|week|month
  // Downloads the sales report as a PDF file.
  router.get('/pdf', async (req, res) => {
    const { range = 'today' } = req.query;
    if (!PRESETS.includes(range)) {
      return res.status(400).json({ error: `range must be one of: ${PRESETS.join(', ')}` });
    }
    try {
      const pdf = await buildReportPdf({ range, reportGenerator, storeProfile });
      const { label } = resolveRange(range);
      const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="sales-report-${safeLabel}.pdf"`);
      res.send(pdf);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/reports/send  { range }
  router.post('/send', async (req, res) => {
    const { range = 'today' } = req.body || {};
    if (!PRESETS.includes(range)) {
      return res.status(400).json({ error: `range must be one of: ${PRESETS.join(', ')}` });
    }
    try {
      const result = await sendReportEmail({ range, reportGenerator, storeProfile, emailSettings });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/reports/test-email
  router.post('/test-email', async (req, res) => {
    try {
      const result = await sendTestEmail({ emailSettings });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

module.exports = buildReportsRouter;
