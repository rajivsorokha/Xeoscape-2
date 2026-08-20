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
    const result = await activation.activate('PHARM-RX7Q-4M2P-2026');
    expect(result.activated).toBe(true);
    expect(result.storeType).toBe('pharmacy');
    expect(storeConfig.currentStoreType).toBe('pharmacy');
  });

  test('activation key matching is case-insensitive and trims whitespace', async () => {
    const result = await activation.activate('  pharm-rx7q-4m2p-2026  ');
    expect(result.storeType).toBe('pharmacy');
  });

  test('rejects an invalid key', async () => {
    await expect(activation.activate('NOT-A-REAL-KEY')).rejects.toThrow('Invalid activation key');
  });

  test('persists activation status across a new Activation instance (same dataDir)', async () => {
    await activation.activate('RETAIL-GENR-8F3K-2026');
    const reloaded = new Activation(dataDir);
    const status = await reloaded.getStatus();
    expect(status.activated).toBe(true);
    expect(status.storeType).toBe('generalRetail');
  });

  test('deactivate clears the activation record', async () => {
    await activation.activate('GROCR-SUPM-9T5W-2026');
    await activation.deactivate();
    expect(await activation.getStatus()).toEqual({ activated: false, storeType: null });
  });

  test('every store type has a pool of activation keys', () => {
    const storeTypes = Object.keys(storeConfig.storeTypes);
    storeTypes.forEach((id) => {
      expect(Array.isArray(activation.keys[id])).toBe(true);
      expect(activation.keys[id].length).toBeGreaterThan(0);
    });
  });

  test('activation records this device and is not marked demo for a real key', async () => {
    const result = await activation.activate('PHARM-RX7Q-4M2P-2026');
    expect(result.isDemo).toBe(false);
    const status = await activation.getStatus();
    expect(status.isDemo).toBe(false);
    expect(status.deviceId).toEqual(expect.any(String));
    expect(status.deviceLabel).toEqual(expect.any(String));
  });

  test('the same device ID persists across a new Activation instance (same dataDir)', async () => {
    await activation.activate('PHARM-RX7Q-4M2P-2026');
    const { deviceId } = await activation.getStatus();

    const reloaded = new Activation(dataDir);
    await reloaded.deactivate();
    await reloaded.activate('GROCR-SUPM-9T5W-2026');
    const { deviceId: deviceIdAfterReactivation } = await reloaded.getStatus();

    expect(deviceIdAfterReactivation).toBe(deviceId);
  });

  test('a demo key activates as whichever store type is requested', async () => {
    const demoKey = activation.keys.demo[0];
    const result = await activation.activate(demoKey, 'pharmacy');
    expect(result.isDemo).toBe(true);
    expect(result.storeType).toBe('pharmacy');
    expect(storeConfig.currentStoreType).toBe('pharmacy');
  });

  test('a demo key rejects an unknown requested store type', async () => {
    const demoKey = activation.keys.demo[0];
    await expect(activation.activate(demoKey, 'not-a-real-store-type')).rejects.toThrow(
      'Select a store type to try the demo as.'
    );
  });

  test('a demo key requires a requested store type', async () => {
    const demoKey = activation.keys.demo[0];
    await expect(activation.activate(demoKey)).rejects.toThrow('Select a store type to try the demo as.');
  });
});
