// assets/js/shared/whatsapp.js
// Builds "click to chat" WhatsApp links (https://wa.me/...) so a bill
// or order summary can be sent to a customer without needing the
// WhatsApp Business API, credentials, or a backend integration.

export function buildWhatsAppUrl(phone, message) {
  // wa.me expects digits only (with country code, no + or symbols).
  const digitsOnly = (phone || '').replace(/[^\d]/g, '');
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

/**
 * Opens WhatsApp (desktop app, or web.whatsapp.com in the browser) with
 * the given message pre-filled, addressed to `phone` if provided, or
 * as a generic share link the user can forward to any contact.
 */
export function openWhatsApp(phone, message) {
  const url = buildWhatsAppUrl(phone, message);
  window.open(url, '_blank');
}
