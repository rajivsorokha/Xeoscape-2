// scripts/seed-grocery.js
// Seeds the General Retail catalog with categories and a representative
// sample of grocery/general-store products (Indian Rupee pricing),
// based on the category list the store owner provided.
//
// This adds ~3 sample products per category rather than every single
// item from the source checklist (which runs to several hundred
// entries) -- enough to populate the catalog for a working demo, with
// the categories all present so more products can be added under the
// right category from the UI.
//
// Usage:
//   node scripts/seed-grocery.js [dataDir]
// Defaults to ./data/store if no dataDir is given. Safe to re-run --
// skips categories/products that already exist (matched by name/SKU).

const path = require('path');
const { randomUUID } = require('crypto');
const SqliteStore = require('../core/sqlite-store');
const ProductManager = require('../core/product-manager');
const storeConfig = require('../core/store-config');

const CATEGORIES = [
  'Fresh vegetables', 'Fresh fruits', 'Canned foods', 'Sauces', 'Various groceries',
  'Spices & herbs', 'Oils/Vinegars', 'Refrigerated items', 'Dairy', 'Cheese',
  'Frozen', 'Meat', 'Seafood', 'Baked goods', 'Baking', 'Snacks',
  'Personal care', 'Medicine', 'Kitchen', 'Cleaning products', 'Other stuff',
  'Pets', 'Baby', 'Office supplies', 'Alcohol', 'Themed meals'
];

// [name, category, price (INR), stock]
const PRODUCTS = [
  // Fresh vegetables
  ['Carrots (1kg)', 'Fresh vegetables', 40, 80],
  ['Onions (1kg)', 'Fresh vegetables', 35, 100],
  ['Tomatoes (1kg)', 'Fresh vegetables', 45, 90],
  // Fresh fruits
  ['Bananas (1 dozen)', 'Fresh fruits', 60, 70],
  ['Apples (1kg)', 'Fresh fruits', 180, 60],
  ['Oranges (1kg)', 'Fresh fruits', 90, 65],
  // Canned foods
  ['Baked Beans (400g can)', 'Canned foods', 95, 40],
  ['Sweet Corn (400g can)', 'Canned foods', 85, 45],
  ['Tuna Chunks (185g can)', 'Canned foods', 150, 35],
  // Sauces
  ['Tomato Ketchup (500g)', 'Sauces', 110, 50],
  ['Soy Sauce (200ml)', 'Sauces', 95, 40],
  ['Hot Sauce (150ml)', 'Sauces', 120, 30],
  // Various groceries
  ['Basmati Rice (5kg)', 'Various groceries', 450, 40],
  ['Tea Leaves (500g)', 'Various groceries', 220, 55],
  ['Instant Coffee (100g)', 'Various groceries', 280, 45],
  // Spices & herbs
  ['Turmeric Powder (200g)', 'Spices & herbs', 60, 60],
  ['Black Pepper (100g)', 'Spices & herbs', 140, 50],
  ['Garam Masala (100g)', 'Spices & herbs', 90, 55],
  // Oils/Vinegars
  ['Sunflower Oil (1L)', 'Oils/Vinegars', 160, 60],
  ['Olive Oil (500ml)', 'Oils/Vinegars', 450, 25],
  ['White Vinegar (500ml)', 'Oils/Vinegars', 70, 40],
  // Refrigerated items
  ['Fresh Tofu (200g)', 'Refrigerated items', 80, 25],
  ['Tortillas (Pack of 6)', 'Refrigerated items', 90, 30],
  ['Fresh Fruit Juice (1L)', 'Refrigerated items', 130, 35],
  // Dairy
  ['Milk (1L)', 'Dairy', 60, 100],
  ['Butter (500g)', 'Dairy', 250, 45],
  ['Yogurt (400g)', 'Dairy', 55, 60],
  // Cheese
  ['Cheddar Cheese (200g)', 'Cheese', 180, 35],
  ['Mozzarella Cheese (200g)', 'Cheese', 190, 30],
  ['Paneer (200g)', 'Cheese', 90, 50],
  // Frozen
  ['Frozen Peas (500g)', 'Frozen', 75, 40],
  ['Ice Cream Tub (1L)', 'Frozen', 220, 30],
  ['Frozen French Fries (1kg)', 'Frozen', 160, 35],
  // Meat
  ['Chicken Breast (1kg)', 'Meat', 280, 30],
  ['Mutton (1kg)', 'Meat', 720, 15],
  ['Chicken Sausages (500g)', 'Meat', 210, 25],
  // Seafood
  ['Fresh Prawns (500g)', 'Seafood', 380, 20],
  ['Pomfret Fish (1kg)', 'Seafood', 550, 15],
  ['Tuna Steaks (500g)', 'Seafood', 420, 12],
  // Baked goods
  ['Sliced Bread (400g)', 'Baked goods', 45, 60],
  ['Butter Croissants (Pack of 4)', 'Baked goods', 120, 25],
  ['Chocolate Cake (500g)', 'Baked goods', 350, 15],
  // Baking
  ['All-Purpose Flour (1kg)', 'Baking', 55, 70],
  ['Sugar (1kg)', 'Baking', 48, 80],
  ['Baking Powder (100g)', 'Baking', 40, 50],
  // Snacks
  ['Potato Chips (150g)', 'Snacks', 40, 90],
  ['Mixed Nuts (250g)', 'Snacks', 220, 40],
  ['Chocolate Cookies (200g)', 'Snacks', 80, 65],
  // Personal care
  ['Shampoo (340ml)', 'Personal care', 240, 40],
  ['Toothpaste (150g)', 'Personal care', 95, 60],
  ['Bath Soap (Pack of 4)', 'Personal care', 120, 55],
  // Medicine
  ['Paracetamol Tablets (10s)', 'Medicine', 25, 100],
  ['Antacid Tablets (15s)', 'Medicine', 40, 70],
  ['Multivitamin Tablets (30s)', 'Medicine', 180, 50],
  // Kitchen
  ['Aluminum Foil (10m)', 'Kitchen', 90, 45],
  ['Dish Soap (500ml)', 'Kitchen', 85, 55],
  ['Garbage Bags (Pack of 30)', 'Kitchen', 110, 40],
  // Cleaning products
  ['Laundry Detergent (1kg)', 'Cleaning products', 180, 40],
  ['Floor Cleaner (1L)', 'Cleaning products', 130, 45],
  ['Glass Cleaner (500ml)', 'Cleaning products', 95, 35],
  // Other stuff
  ['AA Batteries (Pack of 4)', 'Other stuff', 150, 50],
  ['Scented Candles (Set of 2)', 'Other stuff', 220, 25],
  ['LED Light Bulb (9W)', 'Other stuff', 90, 60],
  // Pets
  ['Dog Food (1kg)', 'Pets', 320, 25],
  ['Cat Litter (5kg)', 'Pets', 420, 15],
  ['Pet Shampoo (250ml)', 'Pets', 180, 20],
  // Baby
  ['Diapers (Pack of 30)', 'Baby', 550, 30],
  ['Baby Wipes (80s)', 'Baby', 150, 40],
  ['Infant Formula (400g)', 'Baby', 650, 20],
  // Office supplies
  ['A4 Paper Ream (500 sheets)', 'Office supplies', 320, 30],
  ['Ballpoint Pens (Pack of 10)', 'Office supplies', 60, 60],
  ['Sticky Notepads (Set of 3)', 'Office supplies', 80, 40],
  // Alcohol
  ['Beer (6-pack, 330ml)', 'Alcohol', 480, 30],
  ['Red Wine (750ml)', 'Alcohol', 950, 20],
  ['Whiskey (750ml)', 'Alcohol', 1800, 15],
  // Themed meals
  ['Taco Night Kit', 'Themed meals', 350, 15],
  ['Pizza Night Kit', 'Themed meals', 420, 15],
  ['Spaghetti Night Kit', 'Themed meals', 380, 15]
];

function skuFor(name, index) {
  const prefix = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
  return `${prefix}-${String(index).padStart(4, '0')}`;
}

async function seed(dataDir) {
  storeConfig.configureDataDir(dataDir);
  storeConfig.setStoreType('generalRetail');

  const categoriesDb = new SqliteStore(dataDir, 'categories');
  const existingCategories = await categoriesDb.readAll();
  const existingCategoryNames = new Set(existingCategories.map((c) => c.name));

  let categoriesAdded = 0;
  for (const name of CATEGORIES) {
    if (existingCategoryNames.has(name)) continue;
    await categoriesDb.insert({
      id: randomUUID(),
      name,
      description: '',
      createdAt: new Date().toISOString()
    });
    categoriesAdded += 1;
  }

  const productManager = new ProductManager(dataDir);
  const existingProducts = await productManager.list();
  const existingProductNames = new Set(existingProducts.map((p) => p.name));

  let productsAdded = 0;
  for (let index = 0; index < PRODUCTS.length; index += 1) {
    const [name, category, price, stock] = PRODUCTS[index];
    if (existingProductNames.has(name)) continue;
    await productManager.create({
      name,
      sku: skuFor(name, index + 1),
      price,
      category,
      stock
    });
    productsAdded += 1;
  }

  console.log(`Seed complete: ${categoriesAdded} categories added, ${productsAdded} products added.`);
  console.log(`(${CATEGORIES.length - categoriesAdded} categories and ${PRODUCTS.length - productsAdded} products already existed and were skipped.)`);
}

if (require.main === module) {
  const dataDir = process.argv[2] || path.join(__dirname, '..', 'data', 'store');
  seed(dataDir).catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  });
}

module.exports = { seed, CATEGORIES, PRODUCTS };
