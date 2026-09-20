// tests/unit/activation.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const Activation = require('../../core/activation');
const storeConfig = require('../../core/store-config');

describe('Activation', () => {
  let dataDir;
  let activation;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourshopapp-activation-test-'));
    storeConfig.configureDataDir(dataDir);
    activation = new Activation(dataDir);
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('starts out not activated', async () => {
    expect(await activation.getStatus()).toEqual({ activated: false, storeType: null });
  });

  test('activates with a valid key and sets the matching store type', async () => {
    const result = await activation.activate('APRL-FASH-3K8N-2026');
    expect(result.activated).toBe(true);
    expect(result.storeType).toBe('apparel');
    expect(storeConfig.currentStoreType).toBe('apparel');
  });

  test('activation key matching is case-insensitive and trims whitespace', async () => {
    const result = await activation.activate('  aprl-fash-3k8n-2026  ');
    expect(result.storeType).toBe('apparel');
  });

  test('rejects an invalid key', async () => {
    await expect(activation.activate('NOT-A-REAL-KEY')).rejects.toThrow('Invalid activation key');
  });

  test('persists activation status across a new Activation instance (same dataDir)', async () => {
    await activation.activate('APRL-FASH-3K8N-2026');
    const reloaded = new Activation(dataDir);
    const status = await reloaded.getStatus();
    expect(status.activated).toBe(true);
    expect(status.storeType).toBe('apparel');
  });

  test('deactivate clears the activation record', async () => {
    await activation.activate('APRL-FASH-3K8N-2026');
    await activation.deactivate();
    expect(await activation.getStatus()).toEqual({ activated: false, storeType: null });
  });

  test('every store type has a corresponding activation key', () => {
    const storeTypes = Object.keys(storeConfig.storeTypes);
    storeTypes.forEach((id) => {
      expect(activation.keys[id]).toBeTruthy();
    });
  });
});
