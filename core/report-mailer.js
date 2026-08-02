// core/report-mailer.js
// Builds a sales report (HTML + plain text) for a date range and sends
// it via nodemailer using the configured SMTP settings.

const nodemailer = require('nodemailer');
const { resolveRange } = require('./report-ranges');

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
    ? topProducts.map((p) => `<tr><td>${p.name}</td><td>${p.quantity}</td><td>${money(p.revenue)}</td></tr>`).join('')
    : '<tr><td colspan="3">No sales in this period.</td></tr>';

  const html = `
    <div style="font-family: Arial, sans-serif; color: #2c3e50;">
      <h2 style="color:#16a085;">${profile.storeName || 'Xeoscape'} \u2014 Sales Report</h2>
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
      ${profile.receiptFooter ? `<p style="margin-top:1.5rem; color:#7f8c8d; font-size:0.85rem;">${profile.receiptFooter}</p>` : ''}
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
  return nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    secure: s.smtpSecure,
    auth: { user: s.smtpUser, pass: s.smtpPass }
  });
}

async function sendReportEmail({ range, reportGenerator, storeProfile, emailSettings }) {
  if (!(await emailSettings.isConfigured())) {
    throw new Error('Email is not configured yet. Fill in SMTP settings first.');
  }
  const recipients = await emailSettings.getRecipientList();
  if (recipients.length === 0) {
    throw new Error('No report recipients configured.');
  }

  const { subject, html, text } = await buildReportContent({ range, reportGenerator, storeProfile });
  const s = await emailSettings.get();
  const transport = await buildTransport(emailSettings);

  await transport.sendMail({
    from: `"${s.fromName}" <${s.fromEmail}>`,
    to: recipients.join(', '),
    subject,
    text,
    html
  });

  return { sentTo: recipients, subject };
}

async function sendTestEmail({ emailSettings }) {
  if (!(await emailSettings.isConfigured())) {
    throw new Error('Email is not configured yet. Fill in SMTP settings first.');
  }
  const recipients = await emailSettings.getRecipientList();
  if (recipients.length === 0) {
    throw new Error('No report recipients configured.');
  }
  const s = await emailSettings.get();
  const transport = await buildTransport(emailSettings);

  await transport.sendMail({
    from: `"${s.fromName}" <${s.fromEmail}>`,
    to: recipients.join(', '),
    subject: 'Xeoscape -- Test Email',
    text: 'This is a test email confirming your report email settings are working.',
    html: '<p>This is a test email confirming your report email settings are working.</p>'
  });

  return { sentTo: recipients };
}

module.exports = { buildReportContent, sendReportEmail, sendTestEmail };
