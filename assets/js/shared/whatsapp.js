// assets/js/shared/whatsapp.js
// WhatsApp helpers for the POS screen and receipt.
//
//  - sendBillOnWhatsApp(): sends the bill straight from the app through
//    the backend (Twilio WhatsApp API, configured in Settings ->
//    WhatsApp) -- no WhatsApp window is opened. If that isn't set up
//    yet, it falls back to the old wa.me "click to chat" link so the
//    button still does something useful.
//  - getWhatsAppPhone(): finds the number to send to -- the customer's
//    saved number, then a number already typed for this sale, and only
//    asks the cashier when neither exists (and saves what they type to
//    the customer so it's never asked again).

import apiClient from './api-client.js';
import { promptModal } from '../ui/prompt.js';
import notification from '../ui/notification.js';

export function buildWhatsAppUrl(phone, message) {
  // wa.me expects digits only (with country code, no + or symbols).
  const digitsOnly = (phone || '').replace(/[^\d]/g, '');
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

/**
 * Opens WhatsApp (desktop app, or web.whatsapp.com in the browser) with
 * the given message pre-filled. Only used as a fallback now.
 */
export function openWhatsApp(phone, message) {
  window.open(buildWhatsAppUrl(phone, message), '_blank');
}

/** True if the text has enough digits to plausibly be a phone number. */
export function looksLikePhone(text) {
  const digits = String(text || '').replace(/[^\d]/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Returns the number to send to, or null if the cashier cancelled.
 *  1. the selected customer's saved phone
 *  2. `knownPhone` (typed earlier for this same sale)
 *  3. ask -- and, if a customer is selected, save it on their record
 */
export async function getWhatsAppPhone({ customerId = null, knownPhone = '' } = {}) {
  if (customerId) {
    try {
      const customer = await apiClient.get(`/customers/${customerId}`);
      if (customer?.phone && looksLikePhone(customer.phone)) return customer.phone;
    } catch (err) {
      // fall through to the other sources
    }
  }
  if (knownPhone && looksLikePhone(knownPhone)) return knownPhone;

  let phone = '';
  while (!looksLikePhone(phone)) {
    const answer = await promptModal(
      phone ? 'That number looks incomplete. Customer WhatsApp number:' : 'Customer WhatsApp number (10 digits, or with country code):',
      phone
    );
    if (answer === null) return null;
    phone = answer.trim();
    if (!phone) return null;
  }

  if (customerId) {
    apiClient.put(`/customers/${customerId}`, { phone }).catch(() => {});
  }
  return phone;
}

/**
 * Sends the bill on WhatsApp. Resolves true if it was sent from the
 * app, false if it fell back to opening WhatsApp (or failed).
 */
export async function sendBillOnWhatsApp({ phone, message, customerName = '', storeName = '', totalText = '' }) {
  let autoSend = false;
  try {
    autoSend = Boolean((await apiClient.get('/whatsapp/status'))?.autoSend);
  } catch (err) {
    autoSend = false;
  }

  if (!autoSend) {
    openWhatsApp(phone, message);
    notification.warning('In-app WhatsApp sending is not set up yet (Settings \u2192 WhatsApp), so WhatsApp was opened instead.');
    return false;
  }

  try {
    await apiClient.post('/whatsapp/send-bill', { phone, message, customerName, storeName, totalText });
    notification.success('Bill sent on WhatsApp.');
    return true;
  } catch (err) {
    notification.error(`WhatsApp not sent: ${err.message}`);
    return false;
  }
}
