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

module.exports = { sendWhatsAppReminder, fillTemplate };
