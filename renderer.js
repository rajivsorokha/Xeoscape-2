// renderer.js
// Frontend entry point. Orchestrates: Activation gate (if not yet
// activated) -> Login screen (always, once per app launch) -> the main
// App controller (router, event bus, feature modules).

import App from './assets/js/core/app.js';
import apiClient from './assets/js/shared/api-client.js';
import { renderActivationGate } from './assets/js/core/activation-gate.js';
import { renderLoginScreen } from './assets/js/core/login-screen.js';
import { initTauriMenuBridge } from './assets/js/native_menu/tauri-menu-bridge.js';

document.addEventListener('DOMContentLoaded', async () => {
  const rootEl = document.getElementById('app-root');

  const status = await apiClient.get('/activation/status').catch(() => ({ activated: false }));
  if (!status.activated) {
    await renderActivationGate(rootEl);
  }

  await renderLoginScreen(rootEl);

  // Restore the normal app shell markup (the gate screens replaced it).
  rootEl.innerHTML = `
    <header class="app-header">
      <div id="app-nav-row" class="app-header-row"></div>
    </header>
    <main id="app-view" class="app-view">
      <div class="app-loading">Loading Xeoscape&hellip;</div>
    </main>
    <footer class="app-footer">
      <span id="store-type-label"></span>
    </footer>
  `;

  const app = new App({ rootElementId: 'app-root' });
  app.start();
  initTauriMenuBridge({ app });
  // Expose for debugging in dev tools
  window.__yourShopApp = app;
});
