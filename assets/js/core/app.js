// assets/js/core/app.js
// Main application controller. Wires up the event bus, router, and
// builds the real button-bar topbar (wraps naturally at narrow widths).
// Products/Categories/Users/Settings open as modals (matching the real
// app's modal-based popups); only Point of Sale and Transactions are
// full-page views, toggled via a single shared button.

import EventBus from './event-bus.js';
import Router from './router.js';
import apiClient from '../shared/api-client.js';
import settingsStore from '../shared/settings-store.js';
import { el } from '../shared/utils.js';

import { mountProductList } from '../modules/products/product-list.js';
import { openProductForm } from '../modules/products/product-form.js';
import { openProductTableModal } from '../modules/products/product-table-modal.js';
import CartManager from '../modules/cart/cart-manager.js';
import { mountCart } from '../modules/cart/cart-ui.js';
import { openOpenTabsModal } from '../modules/cart/open-tabs.js';
import { openPaymentDialog } from '../modules/checkout/payment.js';
import { renderOrderPreview } from '../modules/checkout/receipt.js';
import { openCategoryForm } from '../modules/categories/category-form.js';
import { openCategoryTableModal } from '../modules/categories/category-table-modal.js';
import { mountTransactionList } from '../modules/transactions/transaction-list.js';
import { openCustomerOrdersModal } from '../modules/transactions/customer-orders.js';
import { openUserForm } from '../modules/settings/user-form.js';
import { openUserTableModal } from '../modules/settings/user-table-modal.js';
import { openAccountInfoModal } from '../modules/settings/account-info.js';
import { mountSettingsPage } from '../modules/settings/settings-page.js';
import session from './session.js';

export default class App {
  constructor({ rootElementId = 'app-root' } = {}) {
    this.rootElementId = rootElementId;
    this.eventBus = new EventBus();
    this.router = new Router({ eventBus: this.eventBus });
    this.cartManager = new CartManager({ eventBus: this.eventBus });
    this.navButtons = [];
  }

  async start() {
    await settingsStore.load();
    this._registerRoutes();
    this._buildTopbar();
    this.eventBus.on('route:changed', ({ routeId }) => this._setActiveNav(routeId));
    this.router.start('pos');
    await this._loadStoreTypeLabel();
  }

  // Point of Sale, Transactions, and Settings are full-page views
  // (matching the real #pointofsale / #transactions_view / settings
  // screen toggles). Products, Categories, and Users remain modals.
  _registerRoutes() {
    this.router.register('pos', { mount: (viewEl) => this._mountPosView(viewEl) });
    this.router.register('transactions', { mount: (viewEl) => mountTransactionList(viewEl) });
    this.router.register('settings', { mount: (viewEl) => mountSettingsPage(viewEl, { onStoreTypeChanged: () => this._loadStoreTypeLabel() }) });
  }

  _navBtn({ label, colorClass, routeId, onClick }) {
    const btn = el('button', {
      class: `nav-btn ${colorClass}`,
      onClick: onClick || (() => this.router.navigate(routeId))
    }, label);
    if (routeId) {
      btn.dataset.route = routeId;
      this.navButtons.push(btn);
    }
    return btn;
  }

  _addBtn(colorClass, onClick, title) {
    return el('button', { class: `nav-btn nav-btn-add ${colorClass}`, onClick, title }, '+');
  }

  _buildTopbar() {
    const row1 = document.getElementById('app-nav-row');

    const productsGroup = el('div', { class: 'nav-btn-group' }, [
      this._navBtn({ label: '\u{1F4CB} Products', colorClass: 'nav-btn-green', onClick: () => openProductTableModal() }),
      this._addBtn('nav-btn-warning', () => openProductForm({}), 'New Product')
    ]);

    const categoriesGroup = el('div', { class: 'nav-btn-group' }, [
      this._navBtn({ label: '\u{1F4CA} Categories', colorClass: 'nav-btn-green', onClick: () => openCategoryTableModal() }),
      this._addBtn('nav-btn-warning', () => openCategoryForm({}), 'New Category')
    ]);

    const openTabsBtn = this._navBtn({
      label: '\u{1F6D2} Open Tabs',
      colorClass: 'nav-btn-info',
      onClick: () => openOpenTabsModal({ cartManager: this.cartManager })
    });

    const ordersBtn = this._navBtn({
      label: '\u{1F6D2} Orders',
      colorClass: 'nav-btn-info',
      onClick: () => openCustomerOrdersModal()
    });

    const settingsBtn = this._navBtn({
      label: '\u2699',
      colorClass: 'nav-btn-green',
      routeId: 'settings'
    });

    // The real topbar shows a single toggle button here: "Transactions"
    // while on the POS screen, "Point of Sale" while on Transactions --
    // not two separate buttons.
    const posTxnToggleBtn = el('button', {
      class: 'nav-btn nav-btn-green',
      onClick: () => {
        const next = this.router.currentRoute === 'transactions' ? 'pos' : 'transactions';
        this.router.navigate(next);
      }
    }, '\u{1F4C4} Transactions');
    this.posTxnToggleBtn = posTxnToggleBtn;

    const usersGroup = el('div', { class: 'nav-btn-group' }, [
      this._navBtn({ label: '\u{1F464} Users', colorClass: 'nav-btn-green', onClick: () => openUserTableModal() }),
      this._addBtn('nav-btn-warning', () => openUserForm({}), 'Add User')
    ]);

    const adminBtn = this._navBtn({
      label: '\u{1F464} Administrator',
      colorClass: 'nav-btn-teal',
      onClick: () => openAccountInfoModal()
    });

    const logoutBtn = this._navBtn({
      label: '\u{1F6AA} Log out',
      colorClass: 'nav-btn-warning',
      onClick: () => {
        if (!window.confirm('Log out of Xeoscape?')) return;
        session.logout();
        window.location.reload();
      }
    });

    row1.innerHTML = '';
    row1.appendChild(el('div', { class: 'app-header-group' }, [productsGroup, categoriesGroup, openTabsBtn, ordersBtn]));
    row1.appendChild(el('div', { class: 'app-header-group' }, [settingsBtn, posTxnToggleBtn, usersGroup, adminBtn, logoutBtn]));

    this._setActiveNav('pos');
  }

  _setActiveNav(routeId) {
    this.navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.route === routeId));
    this._updateToggleButtonLabel(routeId);
  }

  _updateToggleButtonLabel(routeId) {
    if (!this.posTxnToggleBtn) return;
    this.posTxnToggleBtn.textContent = routeId === 'transactions' ? '\u{1F6D2} Point of Sale' : '\u{1F4C4} Transactions';
  }

  _mountPosView(viewEl) {
    viewEl.classList.add('pos-view');

    const cartPane = document.createElement('div');
    cartPane.className = 'pos-cart-pane';
    const catalogPane = document.createElement('div');
    catalogPane.className = 'pos-catalog-pane';

    // Cart/order panel on the left, product catalog on the right --
    // matches the real POS screen layout.
    viewEl.appendChild(cartPane);
    viewEl.appendChild(catalogPane);

    mountProductList(catalogPane, { eventBus: this.eventBus });
    mountCart(cartPane, {
      cartManager: this.cartManager,
      onPay: ({ discount, customerId }) => openPaymentDialog({
        cartManager: this.cartManager,
        discount,
        customerId,
        currentUserId: session.getCurrentUser()?.id
      }),
      onPrintPreview: (order) => renderOrderPreview(order)
    });
  }

  async _loadStoreTypeLabel() {
    try {
      const settings = await apiClient.get('/settings');
      const label = document.getElementById('store-type-label');
      if (label) label.textContent = `Store Type: ${settings.storeType.label}`;
      document.title = `${settings.appName} \u2014 ${settings.storeType.label}`;
    } catch (err) {
      console.warn('Could not load store settings', err);
    }
  }
}
