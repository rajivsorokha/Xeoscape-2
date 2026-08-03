// core/sqlite-store.js
// Embedded SQLite collection wrapper. Replaces the NeDB-backed store
// (core/nedb-store.js) with Node's built-in `node:sqlite` module --
// no native addon, so nothing extra to compile or bundle for the
// Windows/Linux `pkg` backend builds.
//
// All collections in a given dataDir (products, categories,
// transactions, ...) share ONE `store.sqlite` file and one open
// connection, each in its own table -- unlike NeDB, which needed a
// separate file per collection. Every store type (General Retail,
// Pharmacy, Grocery/Supermarket, Apparel/Fashion, Electronics,
// Restaurant/Cafe, and more) still shares this one persistence layer
// with no per-vertical special-casing: each table is a schemaless
// document store (`id TEXT`, `doc TEXT` holding JSON), because the set
// of product fields varies per store type (see store-config.js) and a
// rigid SQL schema would fight that.
//
// Settings-style collections (store_profile, email_settings,
// activation, backup_settings) hold a single record with no `id`
// field -- the `id` column is nullable to support that (see
// writeAll/insert below).

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// One shared connection per resolved database file path, so multiple
// SqliteStore instances pointed at the same dataDir (one per
// collection) don't each open their own handle to the same file.
const connectionCache = new Map();

function getConnection(dataDir) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, 'store.sqlite');
  let db = connectionCache.get(filePath);
  if (!db) {
    db = new DatabaseSync(filePath);
    // WAL gives readers/writers better concurrency and is the normal
    // choice for an app that keeps a long-lived connection open.
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    connectionCache.set(filePath, db);
  }
  return db;
}

/**
 * Closes and evicts the cached connection for a dataDir's store.sqlite,
 * if one is open. MUST be called before anything replaces or deletes
 * that file on disk (e.g. a backup restore) -- otherwise the cached
 * connection keeps pointing at the old (now-deleted) file handle and a
 * "fresh" SqliteStore constructed afterwards would transparently reuse
 * it instead of opening the restored file. A real process restart
 * doesn't need this (the cache starts empty), but anything that swaps
 * files while the process keeps running does.
 */
function closeConnectionsUnder(dataDir) {
  const filePath = path.join(dataDir, 'store.sqlite');
  const db = connectionCache.get(filePath);
  if (db) {
    db.close();
    connectionCache.delete(filePath);
  }
}

// Collection/table names all come from source code (never user input),
// but validate anyway since they're interpolated directly into SQL
// (node:sqlite has no way to parameterize an identifier).
function assertSafeTableName(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe collection name: ${name}`);
  }
}

function stripMeta(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

class SqliteStore {
  constructor(dataDir, collectionName) {
    assertSafeTableName(collectionName);
    this.dataDir = dataDir;
    this.collectionName = collectionName;
    this.db = getConnection(dataDir);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "${collectionName}" (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT,
        doc TEXT NOT NULL
      )
    `);
    this.db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_${collectionName}_id" ON "${collectionName}"(id) WHERE id IS NOT NULL`
    );
    this._ready = this._migrateLegacyIfEmpty();
    // Belt-and-suspenders, same reasoning as the old NedbStore: don't
    // let a migration failure surface as an unhandled rejection if a
    // store is constructed but never actually used.
    this._ready.catch(() => {});
  }

  async _whenReady() {
    await this._ready;
    return this.db;
  }

  /**
   * One-time migration from the previous persistence layers:
   *   1. legacy NeDB append-log file `<collection>.nedb`
   *   2. older hand-rolled flat file `<collection>.json`
   * Only runs if this collection's table is still empty, and only if
   * one of those legacy files exists -- so brand-new installs never
   * pay this cost. Idempotent: once data is in `store.sqlite` it's
   * never re-imported.
   */
  async _migrateLegacyIfEmpty() {
    const countRow = this.db.prepare(`SELECT COUNT(*) AS n FROM "${this.collectionName}"`).get();
    if (countRow.n > 0) return;

    const nedbPath = path.join(this.dataDir, `${this.collectionName}.nedb`);
    const jsonPath = path.join(this.dataDir, `${this.collectionName}.json`);

    let legacyRecords = null;

    if (fs.existsSync(nedbPath)) {
      legacyRecords = await this._readLegacyNedb(nedbPath);
    } else if (fs.existsSync(jsonPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (Array.isArray(parsed)) legacyRecords = parsed;
      } catch (err) {
        console.warn(`Legacy JSON migration skipped for ${this.collectionName}: ${err.message}`);
      }
    }

    if (!legacyRecords || legacyRecords.length === 0) return;

    const insert = this.db.prepare(`INSERT INTO "${this.collectionName}" (id, doc) VALUES (?, ?)`);
    this.db.exec('BEGIN');
    try {
      for (const rec of legacyRecords.map(stripMeta)) {
        insert.run(rec.id ?? null, JSON.stringify(rec));
      }
      this.db.exec('COMMIT');
      console.log(`Migrated ${legacyRecords.length} record(s) into "${this.collectionName}" (SQLite).`);
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Reads a legacy NeDB append-log file using the still-installed @seald-io/nedb, read-only, one-time. */
  async _readLegacyNedb(nedbPath) {
    try {
      const Datastore = require('@seald-io/nedb');
      const legacyDb = new Datastore({ filename: nedbPath, autoload: false });
      await legacyDb.loadDatabaseAsync();
      const docs = await legacyDb.findAsync({});
      return docs;
    } catch (err) {
      console.warn(`Legacy NeDB migration skipped for ${this.collectionName}: ${err.message}`);
      return null;
    }
  }

  async readAll() {
    await this._whenReady();
    const rows = this.db.prepare(`SELECT doc FROM "${this.collectionName}" ORDER BY rowid`).all();
    return rows.map((r) => stripMeta(JSON.parse(r.doc)));
  }

  /** Wholesale replace the collection's contents (used for single-record settings-style stores). */
  async writeAll(records) {
    await this._whenReady();
    const insert = this.db.prepare(`INSERT INTO "${this.collectionName}" (id, doc) VALUES (?, ?)`);
    this.db.exec('BEGIN');
    try {
      this.db.exec(`DELETE FROM "${this.collectionName}"`);
      for (const rec of records.map(stripMeta)) {
        insert.run(rec.id ?? null, JSON.stringify(rec));
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return records;
  }

  async insert(record) {
    await this._whenReady();
    const clean = stripMeta(record);
    this.db
      .prepare(`INSERT INTO "${this.collectionName}" (id, doc) VALUES (?, ?)`)
      .run(clean.id ?? null, JSON.stringify(clean));
    return clean;
  }

  async update(id, patch) {
    await this._whenReady();
    const row = this.db.prepare(`SELECT doc FROM "${this.collectionName}" WHERE id = ?`).get(id);
    if (!row) return null;
    const merged = stripMeta({ ...JSON.parse(row.doc), ...patch });
    this.db
      .prepare(`UPDATE "${this.collectionName}" SET doc = ? WHERE id = ?`)
      .run(JSON.stringify(merged), id);
    return merged;
  }

  async remove(id) {
    await this._whenReady();
    const result = this.db.prepare(`DELETE FROM "${this.collectionName}" WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  async findById(id) {
    await this._whenReady();
    const row = this.db.prepare(`SELECT doc FROM "${this.collectionName}" WHERE id = ?`).get(id);
    return row ? stripMeta(JSON.parse(row.doc)) : null;
  }
}

module.exports = SqliteStore;
module.exports.closeConnectionsUnder = closeConnectionsUnder;
