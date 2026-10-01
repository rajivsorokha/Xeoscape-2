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
  scheduleFrequency: 'daily', // 'daily' | 'weekly' | 'monthly'
  // Hour of the day (0-23, shop's local time) a scheduled report goes
  // out. Evening by default: a "daily" report sent at 8am would cover
  // a day that has barely started, so it would nearly always be empty.
  scheduleHour: 21
};

const FREQUENCIES = ['daily', 'weekly', 'monthly'];
const EMAIL_PATTERN = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value || '').trim());
}

/**
 * Turns whatever the form sent into a clean patch: only known fields,
 * correct types, trimmed text. Throws a readable Error for values that
 * could never work (bad port, malformed address) so the person finds
 * out when they save rather than when a report fails to send.
 */
function normalizePatch(patch = {}, current = DEFAULT_EMAIL_SETTINGS) {
  const out = {};
  const text = (key) => { if (patch[key] !== undefined) out[key] = String(patch[key] ?? '').trim(); };

  ['smtpHost', 'smtpUser', 'fromEmail', 'fromName', 'recipients'].forEach(text);

  if (patch.smtpPass !== undefined) out.smtpPass = String(patch.smtpPass ?? '');

  if (patch.smtpPort !== undefined) {
    const raw = String(patch.smtpPort ?? '').trim();
    const port = raw === '' ? 587 : Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP Port must be a number between 1 and 65535 (usually 587 or 465).');
    }
    out.smtpPort = port;
  }
  if (patch.smtpSecure !== undefined) out.smtpSecure = Boolean(patch.smtpSecure);
  if (patch.scheduleEnabled !== undefined) out.scheduleEnabled = Boolean(patch.scheduleEnabled);

  if (patch.scheduleFrequency !== undefined) {
    if (!FREQUENCIES.includes(patch.scheduleFrequency)) {
      throw new Error(`Frequency must be one of: ${FREQUENCIES.join(', ')}.`);
    }
    out.scheduleFrequency = patch.scheduleFrequency;
  }
  if (patch.scheduleHour !== undefined) {
    const hour = Number(patch.scheduleHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Send time must be an hour from 0 to 23.');
    out.scheduleHour = hour;
  }

  if (out.fromEmail && !isValidEmail(out.fromEmail)) {
    throw new Error(`"${out.fromEmail}" is not a valid From Email address.`);
  }
  if (out.recipients !== undefined) {
    const list = out.recipients.split(/[,;\n]/).map((r) => r.trim()).filter(Boolean);
    const bad = list.filter((r) => !isValidEmail(r));
    if (bad.length) throw new Error(`Not a valid email address: ${bad.join(', ')}`);
    out.recipients = list.join(', ');
  }

  // Gmail shows app passwords in four groups separated by spaces; the
  // spaces are not part of the password and make login fail if kept.
  if (out.smtpPass) {
    const host = (out.smtpHost !== undefined ? out.smtpHost : current.smtpHost) || '';
    if (/(^|\.)(gmail|googlemail)\.com$/i.test(host)) out.smtpPass = out.smtpPass.replace(/\s+/g, '');
  }
  return out;
}

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
    const clean = normalizePatch(patch, current);
    // Never let an empty-string PUT accidentally wipe a saved password
    // -- only overwrite smtpPass if a new one was actually provided.
    if (clean.smtpPass === '') delete clean.smtpPass;
    const next = { ...current, ...clean };
    await this.db.writeAll([next]);
    return next;
  }

  async getRecipientList() {
    const { recipients } = await this.get();
    return String(recipients || '')
      .split(/[,;\n]/)
      .map((r) => r.trim())
      .filter(Boolean);
  }

  /**
   * From Email may be left blank when the username is itself an email
   * address (Gmail, Outlook, Zoho...) -- servers like those insist the
   * sender matches the login anyway, so that's what gets used.
   */
  resolveFromEmail(settings) {
    if (settings.fromEmail) return settings.fromEmail;
    return isValidEmail(settings.smtpUser) ? settings.smtpUser : '';
  }

  async isConfigured() {
    const s = await this.get();
    return Boolean(s.smtpHost && s.smtpUser && s.smtpPass && this.resolveFromEmail(s));
  }
}

module.exports = EmailSettings;
module.exports.DEFAULT_EMAIL_SETTINGS = DEFAULT_EMAIL_SETTINGS;
module.exports.normalizePatch = normalizePatch;
module.exports.isValidEmail = isValidEmail;
