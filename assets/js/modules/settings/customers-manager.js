// assets/js/modules/settings/customers-manager.js
// Settings -> Customers: the customer directory with visit history,
// segment filters (regulars, lapsed, owing money ...) and a tool for
// sending a promotion / offer on WhatsApp to the customers you pick.
//
// Offers are sent one customer at a time through WhatsApp's own
// "click to chat" link, with the customer's name filled in. That is
// deliberate: promotional messages sent in bulk through the API need
// pre-approved templates and get numbers blocked, whereas a message
// you send yourself from your own WhatsApp does not.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import { openCustomerForm } from '../customers/customer-form.js';
import { openWhatsApp, looksLikePhone } from '../../shared/whatsapp.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';

const SEGMENTS = [
  { id: 'all', label: 'All customers' },
  { id: 'regulars', label: 'Regulars (2+ visits)' },
  { id: 'inactive', label: "Haven't visited in 30+ days" },
  { id: 'never', label: 'Never bought' },
  { id: 'owing', label: 'Owes money' },
  { id: 'hasPhone', label: 'Has a phone number' }
];

const DEFAULT_OFFER = 'Hi {name}! \u{1F389} This week at {store}: get a special discount on your next visit. Show this message at the counter. See you soon!';

function personalize(template, customer, storeName) {
  const first = String(customer.name || '').trim().split(/\s+/)[0] || 'there';
  return template.replace(/\{name\}/gi, first).replace(/\{store\}/gi, storeName);
}

// wa.me needs the country code. Numbers saved as plain 10 digits get
// the store's default code (India = 91) added.
function withCountryCode(phone, code) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (digits.length === 10) return `${code}${digits}`;
  return digits;
}

function downloadCsv(filename, header, rows) {
  const esc = (v) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const text = '\uFEFF' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export async function mountCustomersManager(container) {
  const symbol = settingsStore.getCurrencySymbol();
  const storeName = settingsStore.getProfile().storeName || 'our store';

  container.appendChild(el('h3', {}, 'Customers'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'Everyone you have saved, with how often they visit and what they spend. Filter a group, tick the customers you want, and send them an offer on WhatsApp. Customers are added at checkout or with + New Customer.'
  ));

  const state = { search: '', segment: 'all', all: [], selected: new Set() };

  const searchInput = el('input', {
    class: 'search-input',
    placeholder: 'Search name, phone or email...',
    onInput: (e) => { state.search = e.target.value.toLowerCase(); render(); }
  });
  const segmentSelect = el('select', {
    onChange: (e) => { state.segment = e.target.value; state.selected.clear(); render(); }
  }, SEGMENTS.map((s) => el('option', { value: s.id }, s.label)));

  const offerBtn = el('button', { class: 'btn btn-sm btn-success', onClick: openOfferComposer }, '\u{1F4E3} Send Offer');
  const exportBtn = el('button', { class: 'btn btn-sm btn-secondary', onClick: exportCsv }, '\u2B07 Download Excel (CSV)');
  const newBtn = el('button', { class: 'btn btn-sm btn-primary', onClick: () => openCustomerForm({ onSaved: load }) }, '+ New Customer');

  container.appendChild(el('div', { style: 'display:flex; gap:0.6rem; align-items:center; flex-wrap:wrap; margin-bottom:0.75rem;' },
    [searchInput, segmentSelect, newBtn, exportBtn, offerBtn]));

  const summaryBox = el('div', { class: 'report-summary-box' }, 'Loading...');
  const tableWrap = el('div', { class: 'table-container', style: 'overflow-x:auto;' });
  container.appendChild(summaryBox);
  container.appendChild(tableWrap);

  async function load() {
    try {
      const [customers, stats] = await Promise.all([
        apiClient.get('/customers'),
        apiClient.get('/reports/detail/customers?minVisits=1')
      ]);
      const byId = new Map(stats.rows.map((r) => [r.customerId, r]));
      state.all = customers.map((c) => {
        const s = byId.get(c.id);
        return {
          ...c,
          visits: s ? s.visits : 0,
          totalSpent: s ? s.totalSpent : 0,
          lastVisitText: s ? s.lastVisit : '',
          daysSinceLast: s ? s.daysSinceLast : null
        };
      });
      render();
    } catch (err) {
      summaryBox.textContent = 'Could not load customers.';
      notification.error(`Failed to load customers: ${err.message}`);
    }
  }

  function visible() {
    return state.all.filter((c) => {
      if (state.search) {
        const hay = `${c.name || ''} ${c.phone || ''} ${c.email || ''}`.toLowerCase();
        if (!hay.includes(state.search)) return false;
      }
      switch (state.segment) {
        case 'regulars': return c.visits >= 2;
        case 'inactive': return c.visits > 0 && c.daysSinceLast >= 30;
        case 'never': return c.visits === 0;
        case 'owing': return (c.balance || 0) > 0;
        case 'hasPhone': return looksLikePhone(c.phone);
        default: return true;
      }
    }).sort((a, b) => b.visits - a.visits || String(a.name).localeCompare(String(b.name)));
  }

  function render() {
    const rows = visible();
    const owed = state.all.reduce((s, c) => s + (c.balance || 0), 0);
    const withPhone = state.all.filter((c) => looksLikePhone(c.phone)).length;

    summaryBox.innerHTML = '';
    summaryBox.appendChild(el('div', { class: 'report-summary-grid' }, [
      ['Total Customers', state.all.length],
      ['With Phone Number', withPhone],
      ['Showing', rows.length],
      ['Total Due / Outstanding', formatMoney(owed, symbol)]
    ].map(([label, value]) => el('div', { class: 'report-summary-cell' }, [
      el('div', { class: 'report-summary-label' }, label),
      el('div', { class: 'report-summary-value' }, String(value))
    ]))));

    offerBtn.textContent = `\u{1F4E3} Send Offer${state.selected.size ? ` (${state.selected.size})` : ''}`;
    tableWrap.innerHTML = '';
    if (!rows.length) {
      tableWrap.appendChild(el('div', { class: 'table-empty' }, 'No customers match.'));
      return;
    }

    const allTicked = rows.every((c) => state.selected.has(c.id));
    const headCheck = el('input', {
      type: 'checkbox',
      checked: allTicked,
      onChange: (e) => {
        rows.forEach((c) => (e.target.checked ? state.selected.add(c.id) : state.selected.delete(c.id)));
        render();
      }
    });
    const thead = el('thead', {}, [el('tr', {}, [
      el('th', {}, [headCheck]),
      ...['Name', 'Phone', 'Visits', 'Total Spent', 'Last Visit', 'Balance Due', 'Last Offer Sent'].map((h) => el('th', {}, h))
    ])]);

    const body = rows.map((c) => el('tr', {}, [
      el('td', {}, [el('input', {
        type: 'checkbox',
        checked: state.selected.has(c.id),
        onChange: (e) => {
          if (e.target.checked) state.selected.add(c.id); else state.selected.delete(c.id);
          offerBtn.textContent = `\u{1F4E3} Send Offer${state.selected.size ? ` (${state.selected.size})` : ''}`;
        }
      })]),
      el('td', {}, [el('a', {
        href: '#',
        style: 'font-weight:600;',
        onClick: (e) => { e.preventDefault(); openCustomerForm({ customer: c, onSaved: load }); }
      }, c.name || '(no name)')]),
      el('td', {}, c.phone || '\u2014'),
      el('td', {}, String(c.visits)),
      el('td', {}, c.visits ? formatMoney(c.totalSpent, symbol) : '\u2014'),
      el('td', {}, c.lastVisitText ? `${c.lastVisitText.slice(0, 10)} (${c.daysSinceLast}d ago)` : '\u2014'),
      el('td', {}, [el('span', { style: (c.balance || 0) > 0 ? 'color:var(--color-danger); font-weight:600;' : '' }, formatMoney(c.balance || 0, symbol))]),
      el('td', {}, c.lastPromotionAt ? String(c.lastPromotionAt).slice(0, 10) : '\u2014')
    ]));

    tableWrap.appendChild(el('table', { class: 'app-table perf-table' }, [thead, el('tbody', {}, body)]));
  }

  function exportCsv() {
    const rows = visible();
    if (!rows.length) { notification.error('Nothing to export.'); return; }
    downloadCsv('customers.csv',
      ['Name', 'Phone', 'Email', 'Visits', 'Total Spent', 'Last Visit', 'Days Since Last Visit', 'Balance Due', 'Last Offer Sent'],
      rows.map((c) => [
        c.name, c.phone ? `\t${c.phone}` : '', c.email, c.visits, c.totalSpent,
        c.lastVisitText, c.daysSinceLast ?? '', c.balance || 0, c.lastPromotionAt ? String(c.lastPromotionAt).slice(0, 10) : ''
      ]));
    notification.success('Customer list downloaded \u2014 open it with Excel.');
  }

  // --- Offer / promotion sender -------------------------------------
  function openOfferComposer() {
    const chosen = visible().filter((c) => state.selected.has(c.id));
    if (!chosen.length) {
      notification.error('Tick the customers you want to send the offer to first.');
      return;
    }
    const sendable = chosen.filter((c) => looksLikePhone(c.phone));
    const skipped = chosen.length - sendable.length;
    if (!sendable.length) {
      notification.error('None of the selected customers has a valid phone number.');
      return;
    }

    let message = DEFAULT_OFFER;
    const textarea = el('textarea', { rows: '6', style: 'width:100%;', onInput: (e) => { message = e.target.value; updatePreview(); } }, message);
    const preview = el('div', { class: 'settings-hint', style: 'white-space:pre-wrap; background:#f4f6f8; padding:0.6rem; border-radius:6px;' });
    function updatePreview() {
      preview.textContent = `Preview for ${sendable[0].name}:\n${personalize(message, sendable[0], storeName)}`;
    }
    updatePreview();

    modalManager.open({
      title: 'Send Offer on WhatsApp',
      content: el('div', {}, [
        el('p', {}, `Sending to ${sendable.length} customer${sendable.length > 1 ? 's' : ''}${skipped ? ` (${skipped} skipped: no valid phone number)` : ''}.`),
        el('div', { class: 'form-field' }, [
          el('label', {}, 'Offer message'),
          textarea,
          el('p', { class: 'settings-hint' }, 'Use {name} for the customer\u2019s first name and {store} for your shop name.')
        ]),
        preview
      ]),
      actions: [
        { label: 'Cancel', className: 'btn-secondary' },
        {
          label: 'Start Sending',
          className: 'btn-primary',
          closeOnClick: false,
          onClick: () => {
            if (!message.trim()) { notification.error('Write the offer message first.'); return; }
            modalManager.close();
            openSendQueue(sendable, message);
          }
        }
      ]
    });
  }

  async function openSendQueue(queue, template) {
    let countryCode = '91';
    try {
      const wa = await apiClient.get('/whatsapp/settings');
      if (wa?.defaultCountryCode) countryCode = String(wa.defaultCountryCode).replace(/[^\d]/g, '') || '91';
    } catch (err) { /* keep default */ }

    let index = 0;
    let sentCount = 0;
    const body = el('div', {});

    async function markSent(c) {
      sentCount += 1;
      apiClient.put(`/customers/${c.id}`, { lastPromotionAt: new Date().toISOString(), lastPromotionText: template.slice(0, 500) })
        .catch(() => {});
    }

    function show() {
      body.innerHTML = '';
      if (index >= queue.length) {
        body.appendChild(el('p', {}, `Done \u2014 ${sentCount} of ${queue.length} offers sent.`));
        return;
      }
      const c = queue[index];
      const text = personalize(template, c, storeName);
      body.appendChild(el('p', {}, `Customer ${index + 1} of ${queue.length}: ${c.name} (${c.phone})`));
      body.appendChild(el('div', { style: 'white-space:pre-wrap; background:#f4f6f8; padding:0.6rem; border-radius:6px; margin-bottom:0.75rem;' }, text));
      body.appendChild(el('div', { style: 'display:flex; gap:0.5rem; flex-wrap:wrap;' }, [
        el('button', {
          class: 'btn btn-success',
          onClick: () => {
            openWhatsApp(withCountryCode(c.phone, countryCode), text);
            markSent(c);
            index += 1;
            show();
          }
        }, '\u{1F4F1} Open WhatsApp & Next'),
        el('button', { class: 'btn btn-secondary', onClick: () => { index += 1; show(); } }, 'Skip')
      ]));
      body.appendChild(el('p', { class: 'settings-hint' }, 'WhatsApp opens with the message ready \u2014 press Send there, come back, and continue with the next customer.'));
    }
    show();

    modalManager.open({
      title: 'Sending Offers',
      content: body,
      actions: [{ label: 'Close', className: 'btn-secondary', onClick: () => load() }]
    });
  }

  await load();
}
