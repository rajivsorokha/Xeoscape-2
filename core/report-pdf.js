// core/report-pdf.js
// Builds a downloadable PDF of a sales report using pdfkit.

const PDFDocument = require('pdfkit');

async function buildReportPdf({ range, reportGenerator, storeProfile }) {
  const { resolveRange } = require('./report-ranges');
  const { from, to, label } = resolveRange(range);
  const [summary, topProducts, profile] = await Promise.all([
    reportGenerator.salesSummary({ from, to }),
    reportGenerator.topProducts({ from, to, limit: 10 }),
    storeProfile.get()
  ]);
  const symbol = profile.currencySymbol || '$';
  const money = (n) => `${symbol} ${Number(n || 0).toLocaleString()}`;

  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const storeName = profile.storeName || 'Xeoscape';

  doc
    .fontSize(18)
    .fillColor('#16a085')
    .text(`${storeName} \u2014 Sales Report`, { align: 'left' });

  doc
    .fontSize(10)
    .fillColor('#7f8c8d')
    .moveDown(0.25)
    .text(
      `Period: ${label} (${new Date(from).toLocaleDateString()} \u2013 ${new Date(to).toLocaleDateString()})`,
      { align: 'left' }
    );

  doc.moveDown(1.2);

  const startY = doc.y;
  const rowHeight = 20;
  const labelX = 48;
  const valueX = 220;

  const summaryRows = [
    ['Total Revenue', money(summary.totalRevenue)],
    ['Transactions', String(summary.totalTransactions)],
    ['Items Sold', String(summary.itemsSold)],
    ['Average Sale', money(summary.averageTransactionValue)]
  ];

  summaryRows.forEach(([k, v], i) => {
    const y = startY + i * rowHeight;
    doc.fontSize(11).fillColor('#34495e').text(k, labelX, y, { continued: false });
    doc.fillColor('#2c3e50').font('Helvetica-Bold').text(v, valueX, y);
    doc.font('Helvetica');
  });

  doc.moveDown(1.5);

  doc
    .fontSize(13)
    .fillColor('#34495e')
    .text('Top Products');

  doc.moveDown(0.5);

  const tableTop = doc.y;
  const colWidths = [330, 60, 120];
  const headers = ['Product', 'Qty Sold', 'Revenue'];

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#2c3e50');
  headers.forEach((h, i) => {
    doc.text(h, 48 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), tableTop);
  });

  doc.moveDown(0.4);

  doc.font('Helvetica').fontSize(10).fillColor('#2c3e50');
  if (topProducts.length === 0) {
    doc.text('No sales in this period.', 48, doc.y);
  } else {
    topProducts.forEach((p) => {
      doc.text(p.name, 48, doc.y, { width: colWidths[0] - 10 });
      doc.text(String(p.quantity), 48 + colWidths[0], doc.y, { width: colWidths[1], align: 'left' });
      doc.text(money(p.revenue), 48 + colWidths[0] + colWidths[1], doc.y);
      doc.moveDown(0.35);
    });
  }

  if (profile.receiptFooter) {
    doc.moveDown(1.5);
    doc
      .fontSize(8.5)
      .fillColor('#7f8c8d')
      .text(profile.receiptFooter);
  }

  const footerY = doc.page.height - 40;
  doc
    .fontSize(8)
    .fillColor('#bdc3c7')
    .text(`Generated ${new Date().toLocaleString()}`, 48, footerY);

  doc.end();
  return done;
}

module.exports = { buildReportPdf };
