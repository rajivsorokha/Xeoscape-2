// tests/helpers/data-dir.js
//
// Every manager in core/ (ProductManager, TransactionManager, ...) now
// persists through core/sqlite-store.js, which keeps ONE open
// `node:sqlite` connection per resolved `<dataDir>/store.sqlite` path,
// cached at module scope (see the `connectionCache` Map there) and
// never closed on its own -- there's no "test is done" signal a store
// could react to.
//
// On Linux/macOS that's harmless to clean up after: unlinking a file
// that a process still has open just detaches the directory entry,
// and the open handle keeps working until closed. Windows/NTFS does
// not allow that -- deleting (or recursively removing a directory
// containing) a file that's still open throws EBUSY. Since every test
// here creates its data dir with `fs.mkdtempSync` and tears it down
// with `fs.rmSync` in afterEach/afterAll, that teardown was failing on
// Windows for every test file that touches a SqliteStore-backed
// manager, even though the tests themselves passed.
//
// The fix is simply to close the cached connection for that dataDir
// first -- exactly what core/backup-manager.js already does before a
// backup restore replaces the same file out from under a running
// process (see SqliteStore.closeConnectionsUnder there for the same
// reasoning applied to a real restore instead of test cleanup).
const fs = require('fs');
const SqliteStore = require('../../core/sqlite-store');

/**
 * Closes any cached SQLite connection under `dataDir`, then removes
 * the directory. Use this in place of a bare `fs.rmSync(dataDir, ...)`
 * in afterEach/afterAll for any test that constructs a manager backed
 * by core/sqlite-store.js (which, as of the SQLite migration, is all
 * of them except pure in-memory helpers).
 *
 * @param {string} dataDir
 */
function cleanupDataDir(dataDir) {
  if (!dataDir) return;
  SqliteStore.closeConnectionsUnder(dataDir);
  fs.rmSync(dataDir, { recursive: true, force: true });
}

module.exports = { cleanupDataDir };
