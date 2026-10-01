// core/report-mailer.js
// Builds a sales report (HTML + plain text) for a date range and sends
// it via nodemailer using the configured SMTP settings.

const nodemailer = require('nodemailer');
const { resolveRange } = require('./report-ranges');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Port 465 is always implicit SSL/TLS and 587 is always STARTTLS
 * (plain connection upgraded afterwards) -- using the wrong "secure"
 * flag for either one can never work, and fails with an unreadable
 * OpenSSL error. So those two ports decide for themselves; the tick
 * box only matters for unusual ports.
 */
function resolveTransportOptions(s) {
  const port = Number(s.smtpPort) || 587;
  const secure = port === 465 ? true : port === 587 ? false : Boolean(s.smtpSecure);
  return {
    host: s.smtpHost,
    port,
    secure,
    auth: { user: s.smtpUser, pass: s.smtpPass },
    // Without these a wrong host/port leaves the button spinning for
    // minutes before anything is reported.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000
  };
}

/**
 * Turns nodemailer/OpenSSL errors into something a shop owner can act
 * on. The original message is kept in brackets so it can still be
 * quoted to whoever hosts the mailbox.
 */
function friendlyMailError(err, s = {}) {
  const raw = String((err && err.message) || err || 'Unknown error').trim();
  const code = err && err.code;
  const host = s.smtpHost || 'the mail server';
  const port = Number(s.smtpPort) || 587;
  const detail = ` [${raw}]`;

  if (code === 'EAUTH' || (err && err.responseCode === 535) || /invalid login|authentication/i.test(raw)) {
    return 'The mail server rejected the username or password. For Gmail, Outlook and Yahoo you must use an '
      + 'App Password (created in your account\u2019s security settings), not your normal password.' + detail;
  }
  if (/wrong version number|ssl routines|tls_validate|packet length too long/i.test(raw)) {
    return `The SSL/TLS setting does not match port ${port}. Use port 465 with SSL/TLS ticked, `
      + 'or port 587 with it unticked.' + detail;
  }
  if (code === 'EDNS' || code === 'ENOTFOUND' || /ENOTFOUND|getaddrinfo/i.test(raw)) {
    return `Cannot find the mail server "${host}". Check the SMTP Host spelling and your internet connection.` + detail;
  }
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNRESET'].includes(code) || /timed? ?out|ECONN/i.test(raw)) {
    return `Could not connect to ${host} on port ${port}. Check the host and port, your internet connection, `
      + 'and that a firewall or antivirus is not blocking outgoing mail.' + detail;
  }
  if (code === 'EENVELOPE' || /recipient|mailbox unavailable|relay/i.test(raw)) {
    return 'The mail server refused the sender or a recipient address. Check From Email and Report Recipients.' + detail;
  }
  return raw;
}

async function buildReportContent({ range, reportGenerator, storeProfile }) {
  const { from, to, label } = resolveRange(range);
  const [summary, topProducts, profile] = await Promise.all([
    reportGenerator.salesSummary({ from, to }),
    reportGenerator.topProducts({ from, to, limit: 10 }),
    storeProfile.get()
  ]);
  const symbol = profile.currencySymbol || '$';
  const money = (n) => `${symbol} ${Number(n || 0).toLocaleString()}`;

  const productRows = topProducts.length
    ? topProducts.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${p.quantity}</td><td>${money(p.revenue)}</td></tr>`).join('')
    : '<tr><td colspan="3">No sales in this period.</td></tr>';

  const html = `
    <div style="font-family: Arial, sans-serif; color: #2c3e50;">
      <h2 style="color:#16a085;">${escapeHtml(profile.storeName || 'Xeoscape')} \u2014 Sales Report</h2>
      <p style="color:#7f8c8d;">Period: <strong>${label}</strong> (${new Date(from).toLocaleDateString()} \u2013 ${new Date(to).toLocaleDateString()})</p>
      <table style="border-collapse:collapse; margin-bottom: 1.5rem;">
        <tr><td style="padding:4px 12px 4px 0;">Total Revenue</td><td><strong>${money(summary.totalRevenue)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;">Transactions</td><td><strong>${summary.totalTransactions}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;">Items Sold</td><td><strong>${summary.itemsSold}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;">Average Sale</td><td><strong>${money(summary.averageTransactionValue)}</strong></td></tr>
      </table>
      <h3 style="color:#34495e;">Top Products</h3>
      <table style="border-collapse:collapse; width:100%;" border="1" cellpadding="6">
        <thead><tr style="background:#ecf0f1;"><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
        <tbody>${productRows}</tbody>
      </table>
      ${profile.receiptFooter ? `<p style="margin-top:1.5rem; color:#7f8c8d; font-size:0.85rem;">${escapeHtml(profile.receiptFooter)}</p>` : ''}
    </div>`;

  const text = [
    `${profile.storeName || 'Xeoscape'} -- Sales Report`,
    `Period: ${label} (${new Date(from).toLocaleDateString()} - ${new Date(to).toLocaleDateString()})`,
    '',
    `Total Revenue: ${money(summary.totalRevenue)}`,
    `Transactions: ${summary.totalTransactions}`,
    `Items Sold: ${summary.itemsSold}`,
    `Average Sale: ${money(summary.averageTransactionValue)}`,
    '',
    'Top Products:',
    ...topProducts.map((p) => `- ${p.name}: ${p.quantity} sold, ${money(p.revenue)}`)
  ].join('\n');

  return { subject: `${profile.storeName || 'Xeoscape'} Sales Report -- ${label}`, html, text, summary, topProducts };
}

async function buildTransport(emailSettings) {
  const s = await emailSettings.get();
  return nodemailer.createTransport(resolveTransportOptions(s));
}

async function deliver({ emailSettings, recipients, subject, text, html }) {
  const s = await emailSettings.get();
  const transport = await buildTransport(emailSettings);
  try {
    await transport.sendMail({
      // Object form, so a name containing quotes or commas can't
      // break the From header.
      from: { name: s.fromName || '', address: emailSettings.resolveFromEmail(s) },
      to: recipients.join(', '),
      subject,
      text,
      html
    });
  } catch (err) {
    throw new Error(friendlyMailError(err, s));
  } finally {
    transport.close();
  }
}

async function requireReady(emailSettings) {
  if (!(await emailSettings.isConfigured())) {
    throw new Error('Email is not configured yet. Fill in SMTP Host, Username, Password and From Email, then Save.');
  }
  const recipients = await emailSettings.getRecipientList();
  if (recipients.length === 0) {
    throw new Error('No report recipients configured. Add at least one address under Report Recipients and Save.');
  }
  return recipients;
}

async function sendReportEmail({ range, reportGenerator, storeProfile, emailSettings }) {
  const recipients = await requireReady(emailSettings);
  const { subject, html, text } = await buildReportContent({ range, reportGenerator, storeProfile });
  await deliver({ emailSettings, recipients, subject, text, html });
  return { sentTo: recipients, subject };
}

async function sendTestEmail({ emailSettings }) {
  const recipients = await requireReady(emailSettings);
  await deliver({
    emailSettings,
    recipients,
    subject: 'Xeoscape -- Test Email',
    text: 'This is a test email confirming your report email settings are working.',
    html: '<p>This is a test email confirming your report email settings are working.</p>'
  });
  return { sentTo: recipients };
}

module.exports = { buildReportContent, sendReportEmail, sendTestEmail, friendlyMailError, resolveTransportOptions, escapeHtml };
