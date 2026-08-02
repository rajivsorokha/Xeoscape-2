// assets/js/modules/cart/cart-manager.js
// In-memory cart state for the active checkout session. Emits
// 'cart:updated' on the shared event bus whenever the cart changes.

export default class CartManager {
  constructor({ eventBus }) {
    this.eventBus = eventBus;
    this.lines = new Map(); // productId -> { product, quantity }

    this.eventBus?.on('cart:add', ({ product, quantity = 1 }) => this.add(product, quantity));
  }

  add(product, quantity = 1) {
    const existing = this.lines.get(product.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.lines.set(product.id, { product, quantity });
    }
    this._emitUpdate();
  }

  setQuantity(productId, quantity) {
    if (quantity <= 0) {
      this.remove(productId);
      return;
    }
    const line = this.lines.get(productId);
    if (line) {
      line.quantity = quantity;
      this._emitUpdate();
    }
  }

  remove(productId) {
    this.lines.delete(productId);
    this._emitUpdate();
  }

  clear() {
    this.lines.clear();
    this._emitUpdate();
  }

  getLines() {
    return Array.from(this.lines.values());
  }

  getSubtotal() {
    return this.getLines().reduce((sum, l) => sum + l.product.price * l.quantity, 0);
  }

  toCheckoutItems() {
    return this.getLines().map((l) => ({ productId: l.product.id, quantity: l.quantity }));
  }

  _emitUpdate() {
    this.eventBus?.emit('cart:updated', { lines: this.getLines(), subtotal: this.getSubtotal() });
  }
}
