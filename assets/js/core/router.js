// assets/js/core/router.js
// Small hash-based router that swaps the contents of #app-view between
// registered feature modules. Nav UI is built separately (see
// core/app.js) so it can match the real button-bar layout; this module
// only owns route registration, view mounting, and route:changed events.

export default class Router {
  constructor({ viewElementId = 'app-view', eventBus }) {
    this.viewEl = document.getElementById(viewElementId);
    this.eventBus = eventBus;
    this.routes = new Map();
    this.currentRoute = null;

    window.addEventListener('hashchange', () => this._onHashChange());
  }

  register(routeId, { label, mount, icon = '' }) {
    this.routes.set(routeId, { label, mount, icon });
    return this;
  }

  start(defaultRoute) {
    // Always begin on the default route (POS) -- this is the app's
    // "home" screen. Without this, a stale #hash left over from a
    // previous reload/session (e.g. the app was last showing Settings
    // or Transactions) would silently reopen that page instead of POS.
    if (window.location.hash.replace('#', '') === defaultRoute) {
      this._render(defaultRoute);
    } else {
      this.navigate(defaultRoute);
    }
  }

  navigate(routeId) {
    if (!this.routes.has(routeId)) {
      console.warn(`No route registered for "${routeId}"`);
      return;
    }
    window.location.hash = routeId;
  }

  _onHashChange() {
    const routeId = window.location.hash.replace('#', '');
    this._render(routeId);
  }

  _render(routeId) {
    const route = this.routes.get(routeId);
    if (!route || !this.viewEl) return;

    this.currentRoute = routeId;
    this.viewEl.innerHTML = '';
    // Reset to the base class so a route-specific class added by a
    // previous view (e.g. POS adding "pos-view" for its 2-column grid)
    // doesn't silently leak into whichever view renders next.
    this.viewEl.className = 'app-view';
    route.mount(this.viewEl);

    this.eventBus?.emit('route:changed', { routeId });
  }
}
