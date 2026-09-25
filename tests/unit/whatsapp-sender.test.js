// tests/unit/whatsapp-sender.test.js
const { normalizePhone, sendWhatsAppBill } = require('../../core/whatsapp-sender');

describe('normalizePhone', () => {
  test('adds the default country code to a bare 10-digit number', () => {
    expect(normalizePhone('98765 43210', '91')).toBe('+919876543210');
  });
  test('keeps numbers that already carry a country code', () => {
    expect(normalizePhone('+91 98765-43210', '91')).toBe('+919876543210');
    expect(normalizePhone('919876543210', '91')).toBe('+919876543210');
    expect(normalizePhone('+1 (555) 123-4567', '91')).toBe('+15551234567');
  });
  test('strips a leading trunk 0', () => {
    expect(normalizePhone('09876543210', '91')).toBe('+919876543210');
  });
  test('rejects things that are not phone numbers', () => {
    expect(normalizePhone('', '91')).toBeNull();
    expect(normalizePhone('abc', '91')).toBeNull();
    expect(normalizePhone('12345', '91')).toBeNull();
  });
});

describe('sendWhatsAppBill', () => {
  const settings = { accountSid: 'ACxxx', authToken: 'tok', fromNumber: '+14155238886', defaultCountryCode: '91', billContentSid: '' };
  let fetchMock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ sid: 'SM1', status: 'queued' }) });
    global.fetch = fetchMock;
  });

  test('posts free text to Twilio with whatsapp: prefixes', async () => {
    const result = await sendWhatsAppBill({ settings, toNumber: '9876543210', body: 'Hello bill' });
    expect(result).toEqual({ sid: 'SM1', status: 'queued' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/Accounts/ACxxx/Messages.json');
    const params = new URLSearchParams(opts.body);
    expect(params.get('To')).toBe('whatsapp:+919876543210');
    expect(params.get('From')).toBe('whatsapp:+14155238886');
    expect(params.get('Body')).toBe('Hello bill');
  });

  test('uses the bill template when one is configured', async () => {
    await sendWhatsAppBill({
      settings: { ...settings, billContentSid: 'HX123' },
      toNumber: '9876543210', body: 'ignored', customerName: 'Asha', storeName: 'Xeo', totalText: '\u20B9500'
    });
    const params = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(params.get('ContentSid')).toBe('HX123');
    expect(params.get('Body')).toBeNull();
    expect(JSON.parse(params.get('ContentVariables'))).toEqual({ 1: 'Asha', 2: 'Xeo', 3: '\u20B9500' });
  });

  test('errors clearly when not configured or the number is bad', async () => {
    await expect(sendWhatsAppBill({ settings: { ...settings, authToken: '' }, toNumber: '9876543210', body: 'x' })).rejects.toThrow(/not set up/);
    await expect(sendWhatsAppBill({ settings, toNumber: '123', body: 'x' })).rejects.toThrow(/valid WhatsApp number/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('surfaces Twilio errors', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'Unverified number' }) });
    await expect(sendWhatsAppBill({ settings, toNumber: '9876543210', body: 'x' })).rejects.toThrow('Unverified number');
  });
});
