// tests/unit/report-mailer.test.js
const { friendlyMailError, resolveTransportOptions, escapeHtml } = require('../../core/report-mailer');
const { dueRange, isLastDayOfMonth } = require('../../core/report-scheduler');

describe('resolveTransportOptions', () => {
  const base = { smtpHost: 'smtp.example.com', smtpUser: 'u', smtpPass: 'p' };

  test('port 465 is always SSL/TLS and 587 never is, whatever the tick box says', () => {
    expect(resolveTransportOptions({ ...base, smtpPort: 465, smtpSecure: false }).secure).toBe(true);
    expect(resolveTransportOptions({ ...base, smtpPort: '587', smtpSecure: true }).secure).toBe(false);
  });

  test('other ports follow the tick box, and a blank port falls back to 587', () => {
    expect(resolveTransportOptions({ ...base, smtpPort: 2525, smtpSecure: true }).secure).toBe(true);
    expect(resolveTransportOptions({ ...base, smtpPort: '', smtpSecure: false }).port).toBe(587);
  });

  test('has connection timeouts so a wrong host cannot hang the button', () => {
    const o = resolveTransportOptions({ ...base, smtpPort: 587 });
    expect(o.connectionTimeout).toBeGreaterThan(0);
    expect(o.socketTimeout).toBeGreaterThan(0);
  });
});

describe('friendlyMailError', () => {
  test('explains a rejected login and mentions app passwords', () => {
    const msg = friendlyMailError(Object.assign(new Error('Invalid login: 535'), { code: 'EAUTH' }), { smtpHost: 'smtp.gmail.com' });
    expect(msg).toMatch(/App Password/);
  });

  test('explains an SSL/port mismatch instead of showing the OpenSSL error alone', () => {
    const msg = friendlyMailError(new Error('error:0A00010B:SSL routines:tls_validate_record_header:wrong version number'), { smtpPort: 587 });
    expect(msg).toMatch(/port 587/);
    expect(msg).toMatch(/465/);
  });

  test('explains an unknown host and a refused connection', () => {
    expect(friendlyMailError(Object.assign(new Error('getaddrinfo ENOTFOUND smtp.gmial.com'), { code: 'EDNS' }), { smtpHost: 'smtp.gmial.com' }))
      .toMatch(/Cannot find the mail server "smtp.gmial.com"/);
    expect(friendlyMailError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNECTION' }), { smtpHost: 'h', smtpPort: 25 }))
      .toMatch(/Could not connect to h on port 25/);
  });

  test('keeps the original message for anything it does not recognise', () => {
    expect(friendlyMailError(new Error('something odd'))).toBe('something odd');
  });
});

describe('escapeHtml', () => {
  test('neutralises markup in product names', () => {
    expect(escapeHtml('Shirt & <b>Tie</b>')).toBe('Shirt &amp; &lt;b&gt;Tie&lt;/b&gt;');
  });
});

describe('scheduled report timing (dueRange)', () => {
  const at = (iso) => new Date(iso); // local time
  const on = { scheduleEnabled: true, scheduleHour: 21 };

  test('nothing is sent when scheduling is off or it is not the chosen hour', () => {
    expect(dueRange({ ...on, scheduleEnabled: false, scheduleFrequency: 'daily' }, at('2026-10-01T21:00:00'))).toBeNull();
    expect(dueRange({ ...on, scheduleFrequency: 'daily' }, at('2026-10-01T08:00:00'))).toBeNull();
  });

  test('daily sends every day at the chosen hour, covering that day', () => {
    expect(dueRange({ ...on, scheduleFrequency: 'daily' }, at('2026-10-01T21:00:00'))).toBe('today');
  });

  test('weekly sends on Sundays only', () => {
    expect(dueRange({ ...on, scheduleFrequency: 'weekly' }, at('2026-10-04T21:00:00'))).toBe('week'); // Sunday
    expect(dueRange({ ...on, scheduleFrequency: 'weekly' }, at('2026-10-01T21:00:00'))).toBeNull(); // Thursday
  });

  test('monthly sends on the last day of the month only', () => {
    expect(dueRange({ ...on, scheduleFrequency: 'monthly' }, at('2026-10-31T21:00:00'))).toBe('month');
    expect(dueRange({ ...on, scheduleFrequency: 'monthly' }, at('2026-10-30T21:00:00'))).toBeNull();
    expect(isLastDayOfMonth(at('2028-02-29T12:00:00'))).toBe(true); // leap year
    expect(isLastDayOfMonth(at('2026-02-28T12:00:00'))).toBe(true);
  });
});
