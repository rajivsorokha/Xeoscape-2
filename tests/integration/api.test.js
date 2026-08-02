// tests/integration/api.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('http');
const { createServer } = require('../../server');

describe('API integration', () => {
  let dataDir;
  let server;
  let baseUrl;
  let stopScheduler;
  let stopBackupScheduler;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourshopapp-api-test-'));
    const created = await createServer({ dataDir });
    stopScheduler = created.stopScheduler;
    stopBackupScheduler = created.stopBackupScheduler;
    await new Promise((resolve) => {
      server = created.app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll((done) => {
    stopScheduler?.();
    stopBackupScheduler?.();
    server.close(done);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  function call(method, urlPath, body) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = request.request(
        `${baseUrl}${urlPath}`,
        {
          method,
          headers: { 'Content-Type': 'application/json' }
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => (raw += chunk));
          res.on('end', () => {
            let parsed = null;
            try {
              parsed = raw ? JSON.parse(raw) : null;
            } catch (err) {
              parsed = raw;
            }
            resolve({ status: res.statusCode, body: parsed });
          });
        }
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  function uploadCsv(urlPath, csvContent, filename = 'import.csv') {
    return new Promise((resolve, reject) => {
      const boundary = `----testboundary${Date.now()}`;
      const body =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: text/csv\r\n\r\n` +
        `${csvContent}\r\n` +
        `--${boundary}--\r\n`;

      const req = request.request(
        `${baseUrl}${urlPath}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': Buffer.byteLength(body)
          }
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => (raw += chunk));
          res.on('end', () => {
            let parsed = null;
            try {
              parsed = raw ? JSON.parse(raw) : null;
            } catch (err) {
              parsed = raw;
            }
            resolve({ status: res.statusCode, body: parsed });
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  test('GET /api/health returns ok', async () => {
    const res = await call('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('creates and retrieves a product', async () => {
    const createRes = await call('POST', '/api/inventory/products', {
      name: 'Test Widget',
      sku: 'TW-001',
      price: 15.5,
      stock: 20
    });
    expect(createRes.status).toBe(201);

    const listRes = await call('GET', '/api/inventory/products');
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((p) => p.sku === 'TW-001')).toBe(true);
  });

  test('checkout flow via API', async () => {
    const createRes = await call('POST', '/api/inventory/products', {
      name: 'Checkout Widget',
      sku: 'CW-001',
      price: 3,
      stock: 10
    });
    const productId = createRes.body.id;

    const checkoutRes = await call('POST', '/api/transactions', {
      items: [{ productId, quantity: 4 }]
    });
    expect(checkoutRes.status).toBe(201);
    expect(checkoutRes.body.total).toBe(12);
  });

  test('GET /api/inventory/products/csv-template returns a downloadable CSV matching the current store type', async () => {
    const res = await call('GET', '/api/inventory/products/csv-template');
    expect(res.status).toBe(200);
    expect(res.body).toMatch(/^name,sku,price,category,stock/);
  });

  test('POST /api/inventory/products/csv-import bulk-creates products and reports per-row errors', async () => {
    const csv =
      'name,sku,price,category,stock\n' +
      'CSV Widget A,CSV-A,10,Gadgets,5\n' +
      ',CSV-B,10,Gadgets,5\n' + // missing required name -> should error, not abort the batch
      'CSV Widget C,CSV-C,7.5,Gadgets,2\n';

    const res = await uploadCsv('/api/inventory/products/csv-import', csv);
    expect(res.status).toBe(200);
    expect(res.body.createdCount).toBe(2);
    expect(res.body.failedCount).toBe(1);
    expect(res.body.errors[0].message).toMatch(/Product Name is required/);

    const listRes = await call('GET', '/api/inventory/products');
    expect(listRes.body.some((p) => p.sku === 'CSV-A')).toBe(true);
    expect(listRes.body.some((p) => p.sku === 'CSV-C')).toBe(true);
  });

  test('GET /api/categories/csv-template and POST csv-import work end to end', async () => {
    const templateRes = await call('GET', '/api/categories/csv-template');
    expect(templateRes.status).toBe(200);
    expect(templateRes.body).toMatch(/^name,description/);

    const csv = 'name,description\nBeverages,Cold drinks and juices\nSnacks,\n';
    const importRes = await uploadCsv('/api/categories/csv-import', csv);
    expect(importRes.status).toBe(200);
    expect(importRes.body.createdCount).toBe(2);

    const listRes = await call('GET', '/api/categories');
    expect(listRes.body.some((c) => c.name === 'Beverages')).toBe(true);
  });

  test('CSV category import skips duplicates by name', async () => {
    const csv = 'name,description\nBeverages,Duplicate attempt\n';
    const importRes = await uploadCsv('/api/categories/csv-import', csv);
    expect(importRes.body.createdCount).toBe(0);
    expect(importRes.body.errors[0].message).toMatch(/already exists/);
  });
});
