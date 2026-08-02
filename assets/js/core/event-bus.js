// assets/js/core/event-bus.js
// Minimal publish/subscribe event bus used to decouple feature modules.

export default class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  }

  off(eventName, handler) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).delete(handler);
    }
  }

  emit(eventName, payload) {
    if (!this.listeners.has(eventName)) return;
    for (const handler of this.listeners.get(eventName)) {
      handler(payload);
    }
  }

  once(eventName, handler) {
    const off = this.on(eventName, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }
}
