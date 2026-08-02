// assets/js/native_menu/tauri-menu-bridge.js
// Wires native menu actions (built in src-tauri/src/main.rs) to the
// in-page app -- Tauri emits plain window events ("menu:navigate",
// "menu:logout") that this listens for via the injected
// window.__TAURI__ global (see tauri.conf.json's app.withGlobalTauri),
// which needs no bundler/import resolution since the frontend loads as
// plain unbundled ES modules.
//
// NOTE: under the old Electron version of this app, the equivalent
// menu items (File > New > Product/Customer, View > Point of
// Sale/Products/Transactions/Settings, File > Logout) sent IPC
// messages via `mainWindow.webContents.send(...)`, but no preload
// script ever exposed `ipcRenderer` to the page (contextIsolation was
// on with no bridge) -- so those menu items never actually did
// anything, even before this migration. This bridge is what actually
// makes them work.
//
// Does nothing (silently) when run outside Tauri, e.g. a plain browser
// tab during development against `node server.js` directly.

export function initTauriMenuBridge({ app }) {
  const tauri = window.__TAURI__;
  if (!tauri || !tauri.event) return;

  tauri.event.listen('menu:navigate', (event) => {
    const routeId = event.payload;
    if (app && app.router) app.router.navigate(routeId);
  });

  tauri.event.listen('menu:logout', async () => {
    if (!window.confirm('Log out of Xeoscape?')) return;
    const session = (await import('../core/session.js')).default;
    session.logout();
    window.location.reload();
  });
}
