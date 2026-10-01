// tests/unit/email-settings.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const EmailSettings = require('../../core/email-settings');
const { cleanupDataDir } = require('../helpers/data-dir');

describe('EmailSettings', () => {
  let dataDir;
  let emailSettings;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourshopapp-email-test-'));
    emailSettings = new EmailSettings(dataDir);
  });

  afterEach(() => {
    cleanupDataDir(dataDir);
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
  test('saves the port as a number and ignores fields it does not know', async () => {
    await emailSettings.update({ smtpPort: '2525', smtpPassSet: true, bogus: 1, smtpHost: '  smtp.example.com ' });
    const saved = await emailSettings.get();
    expect(saved.smtpPort).toBe(2525);
    expect(saved.smtpHost).toBe('smtp.example.com');
    expect(saved.smtpPassSet).toBeUndefined();
    expect(saved.bogus).toBeUndefined();
  });

  test('rejects an impossible port, a bad From Email, and a bad recipient with a readable message', async () => {
    await expect(emailSettings.update({ smtpPort: 'abc' })).rejects.toThrow('SMTP Port');
    await expect(emailSettings.update({ smtpPort: '70000' })).rejects.toThrow('SMTP Port');
    await expect(emailSettings.update({ fromEmail: 'not-an-email' })).rejects.toThrow('From Email');
    await expect(emailSettings.update({ recipients: 'a@x.com, oops' })).rejects.toThrow('oops');
  });

  test('recipients may be separated by commas, semicolons or new lines', async () => {
    await emailSettings.update({ recipients: 'a@x.com; b@x.com\nc@x.com' });
    expect(await emailSettings.getRecipientList()).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  test('spaces in a Gmail app password are removed, but other hosts keep the password as typed', async () => {
    await emailSettings.update({ smtpHost: 'smtp.gmail.com', smtpPass: 'abcd efgh ijkl mnop' });
    expect((await emailSettings.get()).smtpPass).toBe('abcdefghijklmnop');
    await emailSettings.update({ smtpHost: 'mail.example.com', smtpPass: 'has space' });
    expect((await emailSettings.get()).smtpPass).toBe('has space');
  });

  test('From Email can be left blank when the username is an email address', async () => {
    await emailSettings.update({ smtpHost: 'smtp.gmail.com', smtpUser: 'shop@gmail.com', smtpPass: 'secret' });
    expect(await emailSettings.isConfigured()).toBe(true);
    expect(emailSettings.resolveFromEmail(await emailSettings.get())).toBe('shop@gmail.com');
  });

  test('schedule hour defaults to the evening and is validated', async () => {
    expect((await emailSettings.get()).scheduleHour).toBe(21);
    await emailSettings.update({ scheduleHour: '18' });
    expect((await emailSettings.get()).scheduleHour).toBe(18);
    await expect(emailSettings.update({ scheduleHour: 24 })).rejects.toThrow('Send time');
    await expect(emailSettings.update({ scheduleFrequency: 'hourly' })).rejects.toThrow('Frequency');
  });
});
