/** @jest-environment jsdom */
// tests/unit/payment-prefill.test.js -- the Payment modal opens with the
// amount already filled in, so Confirm works with no re-typing.


const mockPost = jest.fn().mockResolvedValue({ id: 't1', items: [], subtotal: 0, discount: 0, total: 0, createdAt: new Date().toISOString(), paymentMethod: 'cash' });
jest.mock('../../assets/js/shared/api-client.js', () => ({ __esModule: true, default: { post: (...a) => mockPost(...a), get: jest.fn(), put: jest.fn() } }));
jest.mock('../../assets/js/shared/settings-store.js', () => ({
  __esModule: true,
  default: {
    getCurrencySymbol: () => '\u20B9',
    getProfile: () => ({ chargeTax: true, taxPercentage: 18 }),
    isCreditEnabled: () => false
  }
}));
const mockRenderReceipt = jest.fn();
jest.mock('../../assets/js/modules/checkout/receipt.js', () => ({ __esModule: true, renderReceipt: (...a) => mockRenderReceipt(...a) }));
jest.mock('../../assets/js/ui/notification.js', () => ({ __esModule: true, default: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }));

import { openPaymentDialog } from '../../assets/js/modules/checkout/payment.js';

const cart = {
  getSubtotal: () => 1000,
  toCheckoutItems: () => [{ productId: 'p1', quantity: 1 }],
  clear: jest.fn()
};

function open(extra = {}) {
  document.body.innerHTML = '';
  openPaymentDialog({ cartManager: cart, currentUserId: 'u1', discount: 0, ...extra });
  return {
    input: document.querySelector('.payment-amount-input'),
    change: document.querySelector('.payment-change-bar'),
    keys: [...document.querySelectorAll('.keypad-key')],
    confirm: [...document.querySelectorAll('.modal-actions button')].find((b) => b.textContent === 'Confirm Payment')
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { mockPost.mockClear(); mockRenderReceipt.mockClear(); });

test('opens with the full tax-inclusive amount already in the Payment box', () => {
  const { input, change } = open();
  expect(input.value).toBe('1180');
  expect(change.textContent).toContain('0');
  expect(change.classList.contains('insufficient')).toBe(false);
});

test('Confirm works straight away with no typing, and passes the phone to the receipt', async () => {
  const { confirm } = open({ phone: '9876543210' });
  confirm.click();
  await flush();
  expect(mockPost).toHaveBeenCalledTimes(1);
  expect(mockPost.mock.calls[0][1].paidAmount).toBe(1180);
  expect(mockRenderReceipt).toHaveBeenCalledWith(expect.anything(), { phone: '9876543210' });
});

test('first keypad press replaces the pre-filled amount (for giving change)', () => {
  const { input, change, keys } = open();
  const key = (k) => keys.find((b) => b.textContent === k);
  key('2').click(); key('0').click(); key('0').click(); key('0').click();
  expect(input.value).toBe('2000');
  expect(change.textContent).toContain('820');
});

test('AC clears to empty and blocks confirm until an amount is entered', async () => {
  const { input, keys, confirm } = open();
  keys.find((b) => b.textContent === 'AC').click();
  expect(input.value).toBe('');
  confirm.click();
  await flush();
  expect(mockPost).not.toHaveBeenCalled();
});
