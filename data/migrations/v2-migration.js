// data/migrations/v2-migration.js
// Migrates v1 (single-purpose) product records to the v2 flexible schema
// used by Xeoscape. Safe to run multiple times (idempotent).
//
// Usage: node data/migrations/v2-migration.js [dataDir]

const fs = require('fs');
const path = require('path');

function migrate(dataDir) {
  const productsFile = path.join(dataDir, 'products.json');
  if (!fs.existsSync(productsFile)) {
    console.log(`No products.json found at ${productsFile}, nothing to migrate.`);
    return { migrated: 0 };
  }

  const products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
  let migrated = 0;

  const next = products.map((p) => {
    if (p.schemaVersion === 2) return p; // already migrated

    const updated = { ...p };

    // Legacy v1 pharmacy-only fields -> generic equivalents
    if ('drugName' in updated) {
      updated.name = updated.name || updated.drugName;
      delete updated.drugName;
    }
    if ('ndcCode' in updated) {
      updated.sku = updated.sku || updated.ndcCode;
      delete updated.ndcCode;
    }
    if ('unitPrice' in updated && updated.price === undefined) {
      updated.price = updated.unitPrice;
      delete updated.unitPrice;
    }
    if ('quantityOnHand' in updated && updated.stock === undefined) {
      updated.stock = updated.quantityOnHand;
      delete updated.quantityOnHand;
    }

    updated.storeType = updated.storeType || 'generalRetail';
    updated.schemaVersion = 2;
    migrated += 1;
    return updated;
  });

  fs.writeFileSync(productsFile, JSON.stringify(next, null, 2), 'utf8');
  return { migrated };
}

if (require.main === module) {
  const dataDir = process.argv[2] || path.join(__dirname, '..', 'store');
  const result = migrate(dataDir);
  console.log(`Migration complete. Records migrated: ${result.migrated}`);
}

module.exports = { migrate };
