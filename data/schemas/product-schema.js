// data/schemas/product-schema.js
// Reference shape of a product record. Actual required/optional fields
// per store type live in config/product-fields.json; this describes the
// envelope every product record shares regardless of store type.

const BASE_PRODUCT_SCHEMA = {
  id: 'string (uuid)',
  storeType: 'string',
  name: 'string',
  sku: 'string',
  price: 'number',
  category: 'string?',
  stock: 'number',
  createdAt: 'string (ISO date)',
  updatedAt: 'string (ISO date)'
  // Additional store-type-specific keys (e.g. size, color, expiryDate,
  // serialNumber, modifiers) are merged in dynamically based on
  // config/product-fields.json for the active store type.
};

module.exports = { BASE_PRODUCT_SCHEMA };
