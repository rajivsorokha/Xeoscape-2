// core/whatsapp-sender.js
// Sends a WhatsApp message via Twilio's Programmable Messaging REST
// API: POST https://api.twilio.com/2010-04-01/Accounts/{Sid}/Messages.json,
// Basic Auth (Account SID : Auth Token), form-urlencoded body -- per
// Twilio's own documented format (this is NOT the same as the Meta
// Cloud API, which uses a different endpoint/auth entirely; this
// integration is Twilio-specific).

function fillTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (msg, [key, value]) => msg.replaceAll(`{{${key}}}`, String(value)),
    template
  );
}

/**
 * Turns whatever was typed/stored ("98765 43210", "+91 98765-43210",
 * "09876543210", "919876543210") into E.164 (+919876543210). A bare
 * 10-digit number gets `defaultCountryCode` prepended. Returns null
 * if it can't be a valid number.
 */
function normalizePhone(input, defaultCountryCode = '91') {
  let digits = String(input ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;
  const cc = String(defaultCountryCode || '').replace(/[^\d]/g, '');
  if (String(input).trim().startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (cc && digits.length === 10) digits = cc + digits;
  if (digits.length < 11 || digits.length > 15) return null;
  return `+${digits}`;
}

async function postToTwilio(settings, params) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${settings.accountSid}/Messages.json`;
  const auth = Buffer.from(`${settings.accountSid}:${settings.authToken}`).toString('base64');
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
  } catch (err) {
    throw new Error(`Could not reach Twilio: ${err.message}`);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || `Twilio error (HTTP ${response.status})`);
  }
  return { sid: data?.sid || null, status: data?.status || null };
}

/**
 * Sends a bill/receipt straight from the app -- no WhatsApp window
 * needs to be opened. Uses the bill template if one is configured,
 * otherwise the full text in `body`.
 */
async function sendWhatsAppBill({ settings, toNumber, body, customerName, storeName, totalText }) {
  if (!settings.accountSid || !settings.authToken || !settings.fromNumber) {
    throw new Error('WhatsApp sending is not set up -- add the Twilio details in Settings \u2192 WhatsApp.');
  }
  const e164 = normalizePhone(toNumber, settings.defaultCountryCode);
  if (!e164) throw new Error('That does not look like a valid WhatsApp number.');

  const params = new URLSearchParams();
  params.set('From', settings.fromNumber.startsWith('whatsapp:') ? settings.fromNumber : `whatsapp:${settings.fromNumber}`);
  params.set('To', `whatsapp:${e164}`);
  if (settings.billContentSid) {
    params.set('ContentSid', settings.billContentSid);
    params.set('ContentVariables', JSON.stringify({ 1: customerName || 'Customer', 2: storeName || '', 3: totalText || '' }));
  } else {
    params.set('Body', body);
  }
  return postToTwilio(settings, params);
}

/**
 * Sends a credit-reminder WhatsApp message to one customer.
 * `toNumber` must be in E.164 format (e.g. +919876543210) -- the
 * "whatsapp:" prefix is added here, not expected on the input.
 */
async function sendWhatsAppReminder({ settings, toNumber, customerName, amountText }) {
  if (!settings.accountSid || !settings.authToken || !settings.fromNumber) {
    throw new Error('WhatsApp is not fully configured -- set Account SID, Auth Token, and From Number in Settings.');
  }
  if (!toNumber) {
    throw new Error('This customer has no phone number on file.');
  }

  const to = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${settings.accountSid}/Messages.json`;
  const auth = Buffer.from(`${settings.accountSid}:${settings.authToken}`).toString('base64');

  const params = new URLSearchParams();
  params.set('From', settings.fromNumber);
  params.set('To', to);

  if (settings.contentSid) {
    // Pre-approved WhatsApp template -- required for real,
    // business-initiated messages outside a 24h customer session.
    params.set('ContentSid', settings.contentSid);
    params.set('ContentVariables', JSON.stringify({ 1: customerName, 2: amountText }));
  } else {
    // Free-form text -- only deliverable via Twilio's WhatsApp Sandbox
    // or within an active 24h session (see core/whatsapp-settings.js).
    const body = fillTemplate(settings.reminderMessage, { name: customerName, amount: amountText });
    params.set('Body', body);
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
  } catch (err) {
    throw new Error(`Could not reach Twilio: ${err.message}`);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || `Twilio error (HTTP ${response.status})`;
    throw new Error(message);
  }
  return { sid: data?.sid || null, status: data?.status || null };
}

module.exports = { sendWhatsAppReminder, sendWhatsAppBill, normalizePhone, fillTemplate };
