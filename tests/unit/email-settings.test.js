// tests/unit/email-settings.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const EmailSettings = require('../../core/email-settings');

describe('EmailSettings', () => {
  let dataDir;
  let emailSettings;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourshopapp-email-test-'));
    emailSettings = new EmailSettings(dataDir);
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('returns sensible defaults when nothing has been saved', async () => {
    const settings = await emailSettings.get();
    expect(settings.smtpHost).toBe('');
    expect(settings.scheduleEnabled).toBe(false);
    expect(settings.scheduleFrequency).toBe('daily');
  });

  test('isConfigured is false until host/user/pass/fromEmail are all set', async () => {
    expect(await emailSettings.isConfigured()).toBe(false);
    await emailSettings.update({ smtpHost: 'smtp.example.com', smtpUser: 'me', smtpPass: 'secret', fromEmail: 'me@example.com' });
    expect(await emailSettings.isConfigured()).toBe(true);
  });

  test('an empty-string password update does not wipe the saved password', async () => {
    await emailSettings.update({ smtpPass: 'original-secret' });
    await emailSettings.update({ smtpHost: 'smtp.example.com', smtpPass: '' });
    expect((await emailSettings.get()).smtpPass).toBe('original-secret');
  });

  test('getRecipientList parses and trims a comma-separated string', async () => {
    await emailSettings.update({ recipients: 'a@x.com,  b@x.com ,c@x.com' });
    expect(await emailSettings.getRecipientList()).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });
});
