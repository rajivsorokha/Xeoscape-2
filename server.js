// server.js
// Express server for Xeoscape. Serves the static frontend and mounts
// all API routers under /api/*.

const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const appConfig = require('./app.config');
const { createCore } = require('./core');
const { initLogger } = require('./core/logger');

const buildCategoriesRouter = require('./api/categories');
const buildCustomersRouter = require('./api/customers');
const buildInventoryRouter = require('./api/inventory');
const buildSettingsRouter = require('./api/settings');
const buildTransactionsRouter = require('./api/transactions');
const buildUsersRouter = require('./api/users');
const buildUploadsRouter = require('./api/uploads');
const buildReportsRouter = require('./api/reports');
const buildActivationRouter = require('./api/activation');
const buildBackupsRouter = require('./api/backups');
const { startScheduler } = require('./core/report-scheduler');
const { startBackupScheduler } = require('./core/backup-scheduler');

async function createServer({ dataDir = appConfig.dataDir } = {}) {
  const app = express();
  const core = createCore(dataDir);

  app.use(cors());
  app.use(bodyParser.json());
  // No-cache for app assets: during development/preview the browser
  // must always revalidate, otherwise ES module changes (and the
  // occasional CSS tweak) stay hidden behind a stale cache for hours.
  app.use(express.static(path.join(__dirname, 'assets'), {
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
  }));
  app.use(express.static(__dirname, { index: false }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: appConfig.appName, version: appConfig.version });
  });

  const { router: uploadsRouter, uploadsDir } = buildUploadsRouter({ dataDir });
  app.use('/uploads', express.static(uploadsDir));
  app.use('/api/uploads', uploadsRouter);

  app.use('/api/categories', buildCategoriesRouter({ dataDir }));
  app.use('/api/customers', buildCustomersRouter({ dataDir }));
  app.use('/api/inventory', buildInventoryRouter(core));
  app.use('/api/settings', buildSettingsRouter(core));
  app.use('/api/transactions', buildTransactionsRouter(core));
  // Ensure a default admin/admin login always exists -- login is
  // mandatory to use the app, so a fresh install must have a way in.
  await buildUsersRouter.ensureDefaultAdmin(dataDir);
  app.use('/api/users', buildUsersRouter({ dataDir, storeConfig: core.storeConfig }));
  app.use('/api/reports', buildReportsRouter(core));
  app.use('/api/activation', buildActivationRouter(core));
  app.use('/api/backups', buildBackupsRouter(core));

  const stopScheduler = startScheduler(core);
  const stopBackupScheduler = startBackupScheduler(core);
  app.locals.stopScheduler = stopScheduler;
  app.locals.stopBackupScheduler = stopBackupScheduler;

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  // Centralized error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return { app, core, stopScheduler, stopBackupScheduler };
}

if (require.main === module) {
  // File-based logging: this process runs as a Tauri "sidecar" with no
  // visible terminal most of the time (same reasoning as the old
  // Electron main-process logger this replaces) -- write a plain log
  // file next to the data directory so problems are always inspectable.
  const logDir = path.join(appConfig.dataDir, '..', 'logs');
  initLogger(logDir);

  createServer().then(({ app }) => {
    const httpServer = app.listen(appConfig.server.port, appConfig.server.host, () => {
      console.log(`${appConfig.appName} server listening at http://${appConfig.server.host}:${appConfig.server.port}`);
    });
    httpServer.on('error', (err) => {
      console.error('Backend server failed to start:', err);
      process.exitCode = 1;
    });
  }).catch((err) => {
    console.error('Failed to start server:', err);
    process.exitCode = 1;
  });
}

module.exports = { createServer };
