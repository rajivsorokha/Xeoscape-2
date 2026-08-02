// app.config.js
// Central application configuration for Xeoscape

const path = require('path');

/**
 * Picks a writable data directory.
 *
 * - XEOSCAPE_DATA_DIR env var always wins if set -- this is how the
 *   Tauri shell tells the backend sidecar where the OS's proper
 *   per-user app-data folder is (see src-tauri/src/main.rs), which is
 *   always writable and the right place for user data on every OS.
 * - When running as a pkg-compiled standalone binary (`process.pkg` is
 *   set) with no env var override -- e.g. if the sidecar were ever run
 *   directly without Tauri -- `__dirname` resolves inside pkg's
 *   read-only virtual snapshot, so default next to the real executable
 *   instead (`path.dirname(process.execPath)` is a real path on disk).
 * - Otherwise (plain `node server.js` in dev, or tests): the familiar
 *   project-relative ./data/store.
 */
function resolveDefaultDataDir() {
  if (process.env.XEOSCAPE_DATA_DIR) return process.env.XEOSCAPE_DATA_DIR;
  if (process.pkg) return path.join(path.dirname(process.execPath), 'data', 'store');
  return path.join(__dirname, 'data', 'store');
}

module.exports = {
  appName: 'Xeoscape',
  appId: 'com.xeoscape.pos',
  licensee: 'Xeoscape',
  version: '2.1.0',
  server: {
    port: process.env.PORT || 4173,
    host: '127.0.0.1'
  },
  window: {
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'Xeoscape'
  },
  dataDir: resolveDefaultDataDir()
};
