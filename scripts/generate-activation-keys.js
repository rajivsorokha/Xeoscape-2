#!/usr/bin/env node
// scripts/generate-activation-keys.js
// Generates (or tops up) config/activation-keys.json: by default 15
// keys per store type, plus 1 demo key (see core/activation.js for
// what a demo key does differently). Safe to re-run at any time --
// existing keys are never changed or removed, only topped up to the
// target count, so previously-issued keys keep working. Also writes a
// plain CSV master list to config/activation-keys-master-list.csv so
// you can track which key has gone out to which store/computer --
// that CSV is the actual enforcement mechanism for "one computer per
// key" (see the note in core/activation.js), so keep it private and
// don't commit it to git.
//
// Usage:
//   node scripts/generate-activation-keys.js
//   node scripts/generate-activation-keys.js --per-type 20 --demo 2

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEYS_PATH = path.join(__dirname, '..', 'config', 'activation-keys.json');
const STORE_TYPES_PATH = path.join(__dirname, '..', 'config', 'store-types.json');
const CSV_PATH = path.join(__dirname, '..', 'config', 'activation-keys-master-list.csv');

// Unambiguous alphabet -- no 0/O or 1/I/L, so a key read aloud over
// the phone to a shop owner is never mis-typed or mis-heard.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomSegment(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function makeKey(prefix) {
  return `${prefix}-${randomSegment(4)}-${randomSegment(4)}`;
}

function prefixFor(bucketId) {
  return bucketId.slice(0, 6).toUpperCase();
}

function getArg(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i === args.length - 1) return fallback;
  const value = Number(args[i + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function csvEscape(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function main() {
  const args = process.argv.slice(2);
  const perType = getArg(args, 'per-type', 15);
  const demoCount = getArg(args, 'demo', 1);

  const storeTypes = Object.keys(JSON.parse(fs.readFileSync(STORE_TYPES_PATH, 'utf8')));
  const existing = fs.existsSync(KEYS_PATH) ? JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8')) : {};

  // Old format had one string key per store type -- migrate it into a
  // one-element array so it's preserved as key #1 rather than
  // discarded (anyone already holding that key keeps a working one).
  const allKnownKeys = new Set(
    Object.values(existing).flatMap((v) => (Array.isArray(v) ? v : [v])).map((k) => k.toUpperCase())
  );

  function topUp(bucketId, target) {
    const current = existing[bucketId];
    const list = Array.isArray(current) ? current.slice() : (current ? [current] : []);
    while (list.length < target) {
      let key;
      do { key = makeKey(prefixFor(bucketId)); } while (allKnownKeys.has(key.toUpperCase()));
      list.push(key);
      allKnownKeys.add(key.toUpperCase());
    }
    return list;
  }

  const result = {};
  storeTypes.forEach((id) => { result[id] = topUp(id, perType); });
  // The demo key isn't tied to a store type in store-types.json, so it
  // gets its own bucket -- core/activation.js special-cases the
  // "demo" bucket id to let whoever activates with it pick any store
  // type to preview, rather than locking to one.
  result.demo = topUp('demo', demoCount);

  fs.writeFileSync(KEYS_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  const rows = [['Store Type', 'Key #', 'Activation Key', 'Status', 'Issued To', 'Date Issued']];
  storeTypes.concat(['demo']).forEach((id) => {
    result[id].forEach((key, i) => {
      rows.push([id, String(i + 1), key, 'Unused', '', '']);
    });
  });
  const csv = `${rows.map((r) => r.map(csvEscape).join(',')).join('\n')}\n`;
  fs.writeFileSync(CSV_PATH, csv, 'utf8');

  const total = Object.values(result).flat().length;
  console.log(`Wrote ${total} keys (${perType} x ${storeTypes.length} store types + ${demoCount} demo) to ${path.relative(process.cwd(), KEYS_PATH)}`);
  console.log(`Wrote master list to ${path.relative(process.cwd(), CSV_PATH)} -- keep this private, it's your tracking sheet.`);
}

main();
