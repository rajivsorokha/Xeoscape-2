// core/whatsapp-settings.js
// Configuration for sending WhatsApp credit/due-balance reminders via
// Twilio's WhatsApp Business API. B2B-only feature (see
// core/transaction-manager.js -- due/credit payment itself is
// B2B General Retail only, so reminders about it are too).
//
// IMPORTANT: WhatsApp requires business-initiated messages (i.e. not
// a reply within 24h of the customer messaging you first) to use a
// pre-approved Message Template, not free-form text -- see
// https://www.twilio.com/docs/whatsapp/api. If `contentSid` is set,
// sends use that approved template (see core/whatsapp-sender.js);
// otherwise it falls back to a plain text Body, which only works in
// Twilio's WhatsApp Sandbox (development/testing) or within an active
// 24-hour customer-initiated session -- not for real, unprompted
// reminders to real customers. Set up a template in the Twilio/Meta
// console before relying on this for production reminders.

const SqliteStore = require('./sqlite-store');

const DEFAULT_WHATSAPP_SETTINGS = {
  enabled: false,
  accountSid: '',
  authToken: '',
  fromNumber: '', // e.g. "whatsapp:+14155238886"
  contentSid: '', // optional: pre-approved WhatsApp template SID (see note above)
  reminderMessage: 'Hi {{name}}, this is a reminder that you have an outstanding balance of {{amount}} with us. Please settle at your earliest convenience. Thank you!'
};

class WhatsAppSettings {
  constructor(dataDir) {
    this.db = new SqliteStore(dataDir, 'whatsapp_settings');
  }

  async get() {
    const records = await this.db.readAll();
    return { ...DEFAULT_WHATSAPP_SETTINGS, ...(records[0] || {}) };
  }

  async update(patch) {
    const current = await this.get();
    const next = { ...current, ...patch };
    // Never let an empty-string PUT accidentally wipe a saved auth token.
    if (patch.authToken === '') next.authToken = current.authToken;
    await this.db.writeAll([next]);
    return next;
  }

  async isConfigured() {
    const s = await this.get();
    return Boolean(s.enabled && s.accountSid && s.authToken && s.fromNumber);
  }
}

module.exports = WhatsAppSettings;
module.exports.DEFAULT_WHATSAPP_SETTINGS = DEFAULT_WHATSAPP_SETTINGS;
