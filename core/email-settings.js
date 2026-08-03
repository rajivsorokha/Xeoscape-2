// core/email-settings.js
// SMTP + report-recipient configuration and scheduled-report settings,
// persisted alongside the rest of the store's data.

const SqliteStore = require('./sqlite-store');

const DEFAULT_EMAIL_SETTINGS = {
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  fromEmail: '',
  fromName: 'Xeoscape',
  recipients: '', // comma-separated list
  scheduleEnabled: false,
  scheduleFrequency: 'daily' // 'daily' | 'weekly' | 'monthly'
};

class EmailSettings {
  constructor(dataDir) {
    this.db = new SqliteStore(dataDir, 'email_settings');
  }

  async get() {
    const records = await this.db.readAll();
    return { ...DEFAULT_EMAIL_SETTINGS, ...(records[0] || {}) };
  }

  async update(patch) {
    const current = await this.get();
    // Never let an empty-string PUT accidentally wipe a saved password
    // -- only overwrite smtpPass if a new one was actually provided.
    const next = { ...current, ...patch };
    if (patch.smtpPass === '') next.smtpPass = current.smtpPass;
    await this.db.writeAll([next]);
    return next;
  }

  async getRecipientList() {
    const { recipients } = await this.get();
    return recipients
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
  }

  async isConfigured() {
    const s = await this.get();
    return Boolean(s.smtpHost && s.smtpUser && s.smtpPass && s.fromEmail);
  }
}

module.exports = EmailSettings;
module.exports.DEFAULT_EMAIL_SETTINGS = DEFAULT_EMAIL_SETTINGS;
