// core/nedb-store.js
// Embedded NeDB collection wrapper. Replaces the old hand-rolled
// json-db.js file store with a real embedded database (append-only
// on-disk log + in-memory index, Mongo-like query API) while keeping a
// small, familiar surface (readAll/insert/update/remove/findById) so
// every store type (General Retail, Pharmacy, Grocery/Supermarket,
// Apparel/Fashion, Electronics, Restaurant/Cafe, and more) shares one persistence
// layer with no per-vertical special-casing.
//
// Uses the @seald-io/nedb fork (the original "nedb" package is
// unmaintained and breaks on modern Node) which natively exposes
// promise-based *Async methods alongside the classic callback API.
//
// NOTE: all methods here are async -- this is the one real behavior
// change from the old JsonDb, which was synchronous. Every caller
// (managers, API routes, scripts) awaits these calls.

const fs = require('fs');
const path = require('path');
const Datastore = require('@seald-io/nedb');

function stripMeta(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

class NedbStore {
  constructor(dataDir, collectionName) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    this.dataDir = dataDir;
    this.collectionName = collectionName;
    this.filePath = path.join(dataDir, `${collectionName}.nedb`);
    // autoload:false is deliberate -- with autoload:true, NeDB kicks off
    // its own internal load promise the instant the Datastore is
    // constructed, without giving us a handle to it. That orphaned
    // promise can still be mid-flight (and later reject) long after a
    // caller has moved on -- e.g. a test that tears down its temp
    // directory right after construction. Loading and index creation
    // explicitly, below, means every bit of async init this class does
    // is captured in `this._ready`, so callers (and tests) can always
    // await full readiness with no dangling I/O left behind.
    this.db = new Datastore({ filename: this.filePath, autoload: false });
    this._ready = this.db
      .loadDatabaseAsync()
      .then(() => this.db.ensureIndexAsync({ fieldName: 'id', unique: true, sparse: true }))
      .then(() => this._migrateLegacyJson());
    // Belt-and-suspenders: if a store is constructed but never actually
    // used (e.g. a router built for routes the caller never hits), a
    // rejection here would otherwise surface as an unhandled promise
    // rejection with no test/request to blame it on. This no-op handler
    // doesn't swallow the error for real callers -- `_whenReady()` below
    // awaits the same promise and will still throw normally.
    this._ready.catch(() => {});
  }

  async _whenReady() {
    await this._ready;
    return this.db;
  }

  /**
   * One-time migration from the legacy hand-rolled json-db.js format.
   * If a `<collection>.json` file exists from before the switch to
   * NeDB and the corresponding `.nedb` store is empty (brand new), the
   * legacy records are imported so existing data isn't silently lost.
   * Idempotent: once data is in the `.nedb` store it is never
   * re-imported.
   */
  async _migrateLegacyJson() {
    const jsonPath = path.join(this.dataDir, `${this.collectionName}.json`);
    if (!fs.existsSync(jsonPath)) return;

    try {
      const existingCount = await this.db.countAsync({});
      if (existingCount > 0) return;

      const legacy = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (!Array.isArray(legacy) || legacy.length === 0) return;

      await this.db.insertAsync(legacy.map(stripMeta));
      console.log(`Migrated ${legacy.length} record(s) from legacy ${this.collectionName}.json`);
    } catch (err) {
      // Never let a bad/malformed legacy file block startup.
      console.warn(`Legacy migration skipped for ${this.collectionName}: ${err.message}`);
    }
  }

  async readAll() {
    const db = await this._whenReady();
    const docs = await db.findAsync({});
    return docs.map(stripMeta);
  }

  /** Wholesale replace the collection's contents (used for single-record settings-style stores). */
  async writeAll(records) {
    const db = await this._whenReady();
    await db.removeAsync({}, { multi: true });
    if (records.length) {
      await db.insertAsync(records.map(stripMeta));
    }
    return records;
  }

  async insert(record) {
    const db = await this._whenReady();
    const doc = await db.insertAsync(stripMeta(record));
    return stripMeta(doc);
  }

  async update(id, patch) {
    const db = await this._whenReady();
    const existing = await db.findOneAsync({ id });
    if (!existing) return null;
    const merged = stripMeta({ ...existing, ...patch });
    await db.updateAsync({ id }, merged, {});
    return merged;
  }

  async remove(id) {
    const db = await this._whenReady();
    const numRemoved = await db.removeAsync({ id }, {});
    return numRemoved > 0;
  }

  async findById(id) {
    const db = await this._whenReady();
    const doc = await db.findOneAsync({ id });
    return doc ? stripMeta(doc) : null;
  }
}

module.exports = NedbStore;
