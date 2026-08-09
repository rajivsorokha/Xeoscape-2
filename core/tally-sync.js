// core/tally-sync.js
// Builds Tally's XML import format (ENVELOPE/IMPORTDATA/TALLYMESSAGE,
// per Tally's own XML Integration documentation) for completed sales
// and POSTs it to Tally's local XML gateway. One Sales voucher per
// transaction, itemized (stock items + quantities), with GST split
// into CGST+SGST or IGST ledger entries, and the debit side split
// between the payment-mode ledger (cash/card) for what was actually
// collected and the customer's ledger for any due/partial amount --
// so partial payments show up correctly as real accounts-receivable
// in Tally rather than silently pretending full payment was received.
//
// IMPORTANT CAVEAT: this can only be verified against Tally's
// documented XML schema, not against a real running Tally instance --
// Tally's gateway is a local peer on the same machine/network as this
// app, not reachable from the sandbox this was built in. Test with a
// small batch against your real Tally company before relying on it
// for daily sync.

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tallyDate(isoString) {
  // Tally's VOUCHER DATE tag wants YYYYMMDD, no separators.
  const d = new Date(isoString);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/**
 * Builds one <TALLYMESSAGE> Sales voucher block for a single
 * transaction. Amount sign convention in Tally XML: debit entries are
 * positive under ISDEEMEDPOSITIVE=Yes, credit entries are positive
 * under ISDEEMEDPOSITIVE=No (i.e. the AMOUNT tag itself is always
 * written positive here; the ISDEEMEDPOSITIVE flag carries the
 * debit/credit meaning, which is what Tally's own sample XML does).
 */
function buildVoucherMessage(transaction, settings, customerName) {
  const isReturn = transaction.type === 'return';
  const absTotal = Math.abs(transaction.total);
  const absSubtotal = Math.abs(transaction.subtotal - (transaction.discount || 0));
  const absTax = Math.abs(transaction.taxAmount || 0);
  const paid = Math.abs(transaction.paidAmount || 0);
  const due = Math.abs(transaction.dueAmount || 0);
  const vchType = isReturn ? 'Credit Note' : 'Sales';

  const ledgerEntries = [];

  // --- Debit side: who/what paid ---
  if (isReturn) {
    // A refund: the sales ledger is debited (reversing the original
    // credit) and whichever party received the refund is credited
    // below -- so no separate debit-side split is needed here beyond
    // the sales-ledger reversal itself, added with the credit block.
  } else {
    if (paid > 0) {
      const paymentLedger = transaction.paymentMethod === 'card' ? settings.cardLedgerName : settings.cashLedgerName;
      ledgerEntries.push({ ledger: paymentLedger, positive: true, amount: paid });
    }
    if (due > 0 && customerName) {
      ledgerEntries.push({ ledger: customerName, positive: true, amount: due });
    }
  }

  // --- Credit side: sales + tax (debit side for a return, reversed) ---
  const salesIsPositive = isReturn; // return: sales ledger debited (positive); sale: credited (negative)
  ledgerEntries.push({ ledger: settings.salesLedgerName, positive: salesIsPositive, amount: absSubtotal });

  if (absTax > 0) {
    if (settings.gstType === 'interstate') {
      ledgerEntries.push({ ledger: settings.igstLedgerName, positive: salesIsPositive, amount: absTax });
    } else {
      const half = Number((absTax / 2).toFixed(2));
      ledgerEntries.push({ ledger: settings.cgstLedgerName, positive: salesIsPositive, amount: half });
      ledgerEntries.push({ ledger: settings.sgstLedgerName, positive: salesIsPositive, amount: Number((absTax - half).toFixed(2)) });
    }
  }

  if (isReturn) {
    // Credit whoever is owed the refund -- cash/card if it was
    // refunded that way, otherwise reduce the customer's ledger.
    const refundLedger = customerName || (transaction.paymentMethod === 'card' ? settings.cardLedgerName : settings.cashLedgerName);
    ledgerEntries.push({ ledger: refundLedger, positive: false, amount: absTotal });
  }

  const ledgerXml = ledgerEntries.map((e) => `
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${escapeXml(e.ledger)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${e.positive ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
        <AMOUNT>${e.positive ? '-' : ''}${e.amount.toFixed(2)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`).join('');
  // Note: Tally's own convention (per its sample XML) stores DEBIT
  // amounts as NEGATIVE numbers even though ISDEEMEDPOSITIVE=Yes
  // marks them as the positive/debit side -- the sign and the flag
  // are separate signals Tally cross-checks against each other.

  const inventoryXml = !isReturn ? transaction.items.map((li) => `
      <ALLINVENTORYENTRIES.LIST>
        <STOCKITEMNAME>${escapeXml(li.name)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${li.unitPrice.toFixed(2)}/Nos</RATE>
        <AMOUNT>-${Math.abs(li.lineTotal).toFixed(2)}</AMOUNT>
        <ACTUALQTY>${li.quantity} Nos</ACTUALQTY>
        <BILLEDQTY>${li.quantity} Nos</BILLEDQTY>
      </ALLINVENTORYENTRIES.LIST>`).join('') : '';

  return `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="${vchType}" ACTION="Create" OBJVIEW="Invoice Voucher View">
        <DATE>${tallyDate(transaction.createdAt)}</DATE>
        <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${escapeXml(transaction.id.slice(0, 8).toUpperCase())}</VOUCHERNUMBER>
        <PARTYLEDGERNAME>${escapeXml(customerName || settings.cashLedgerName)}</PARTYLEDGERNAME>
        <ISINVOICE>Yes</ISINVOICE>
        <NARRATION>${escapeXml(isReturn ? `Return against ${transaction.originalTransactionId || ''}` : `Xeoscape POS sale ${transaction.id}`)}</NARRATION>${ledgerXml}${inventoryXml}
      </VOUCHER>
    </TALLYMESSAGE>`;
}

/** Wraps one or more voucher TALLYMESSAGE blocks in the full Import Data envelope. */
function buildEnvelope(messages, settings) {
  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(settings.companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>${messages.join('')}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Builds the full sync XML for a set of transactions. `customerNameById`
 * resolves customerId -> Tally ledger name (the customer's own name,
 * expected to exist as a Sundry Debtor ledger in Tally, or configured
 * to auto-create -- see F12 duplicate-ledger behavior in Tally).
 */
function buildSyncXml(transactions, settings, customerNameById = {}) {
  const messages = transactions.map((t) => buildVoucherMessage(t, settings, t.customerId ? customerNameById[t.customerId] : null));
  return buildEnvelope(messages, settings);
}

/** POSTs the XML to Tally's local gateway. Tally responds with its own XML (success/error log), not JSON. */
async function sendToTally(xml, settings) {
  const url = `http://${settings.host}:${settings.port}`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: xml
    });
  } catch (err) {
    throw new Error(`Could not reach Tally at ${url} -- make sure Tally is running and its XML/HTTP gateway is enabled (F12 > Advanced Configuration in Tally). (${err.message})`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Tally rejected the request (HTTP ${response.status}): ${text.slice(0, 500)}`);
  }
  // Tally's response body is itself XML containing a LINEERROR tag on
  // failure even with a 200 status -- surfaced as-is rather than
  // parsed, since the exact error vocabulary varies by Tally version.
  if (/<LINEERROR>/i.test(text)) {
    const match = text.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/i);
    throw new Error(`Tally reported an error: ${match ? match[1] : text.slice(0, 500)}`);
  }
  return text;
}

module.exports = { buildSyncXml, buildVoucherMessage, buildEnvelope, sendToTally, tallyDate };
