// tests/unit/cart-manager.test.js

import CartManager from '../../assets/js/modules/cart/cart-manager.js';
import EventBus from '../../assets/js/core/event-bus.js';

describe('CartManager', () => {
  let eventBus;
  let cart;

  beforeEach(() => {
    eventBus = new EventBus();
    cart = new CartManager({ eventBus });
  });

  test('adds a product to the cart', () => {
    cart.add({ id: 'p1', name: 'Widget', price: 5 }, 2);
    expect(cart.getLines()).toHaveLength(1);
    expect(cart.getSubtotal()).toBe(10);
  });

  test('increments quantity when adding the same product again', () => {
    const product = { id: 'p1', name: 'Widget', price: 5 };
    cart.add(product, 1);
    cart.add(product, 2);
    expect(cart.getLines()[0].quantity).toBe(3);
  });

  test('emits cart:updated when the cart changes', () => {
    const handler = jest.fn();
    eventBus.on('cart:updated', handler);
    cart.add({ id: 'p1', name: 'Widget', price: 5 }, 1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ subtotal: 5 }));
  });

  test('removes a line when quantity is set to zero', () => {
    cart.add({ id: 'p1', name: 'Widget', price: 5 }, 1);
    cart.setQuantity('p1', 0);
    expect(cart.getLines()).toHaveLength(0);
  });

  test('converts cart lines to checkout items', () => {
    cart.add({ id: 'p1', name: 'Widget', price: 5 }, 3);
    expect(cart.toCheckoutItems()).toEqual([{ productId: 'p1', quantity: 3 }]);
  });
});
