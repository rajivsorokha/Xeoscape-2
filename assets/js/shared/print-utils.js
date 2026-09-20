// assets/js/shared/print-utils.js
//
// Sends a self-contained HTML document to the printer WITHOUT opening
// a new window/popup.
//
// Why this exists: the previous approach (barcode labels; see the old
// openPrintWindow in modules/labels/label-sheet.js) called
// `window.open('', '_blank')` and printed into that new window. That
// works fine in a normal browser tab, but this app ships as a Tauri
// desktop app: the "browser" is really Tauri's own WebView2 (Windows)
// / WebKit (mac) shell. A bare `window.open()` there does NOT create a
// real window unless the app explicitly grants a "create webview
// window" permission in src-tauri/capabilities and wires up a handler
// for it in Rust -- neither of which this app does. Without that,
// `window.open()` just returns null (or a window that never receives
// content), which looks and feels exactly like "the browser blocked
// the pop-up". That's why turning on "Allow pop-ups" in Windows/edge
// settings never fixed anything on other PCs: the OS/browser pop-up
// blocker was never actually involved.
//
// Printing from a hidden <iframe> inside the SAME window sidesteps the
// problem entirely -- no new window is ever requested, so there is
// nothing for Tauri to allow or silently refuse. This is the standard,
// widely-supported way to print arbitrary HTML that isn't the current
// page, and it works the same in a plain browser, Electron, and Tauri.

/**
 * Builds a hidden iframe, loads `html` into it, and opens the OS print
 * dialog for that iframe's content only -- the rest of the app window
 * is completely unaffected and never appears on the printout.
 *
 * @param {string} html a complete HTML document (<html>...</html>)
 * @returns {Promise<void>} resolves once the print dialog has been
 *   requested (not once the user finishes with it -- there's no
 *   reliable cross-platform signal for that after print() returns)
 */
export function printHtml(html) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '0',
      height: '0',
      border: '0',
      visibility: 'hidden'
    });

    let settled = false;
    const cleanup = () => {
      // Removing the iframe immediately after print() can blank the
      // printout on some webviews (notably WebView2), which read from
      // it a moment after the call returns -- so the removal is
      // deferred rather than synchronous.
      setTimeout(() => iframe.remove(), 1000);
    };

    iframe.addEventListener('load', () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        if (!settled) { settled = true; resolve(); }
      } catch (err) {
        if (!settled) { settled = true; reject(err); }
      } finally {
        // afterprint fires on the iframe's own window once the print
        // dialog is dismissed, on every runtime this app targets; the
        // timeout is just a fallback in case a given webview doesn't
        // fire it.
        try {
          iframe.contentWindow.addEventListener('afterprint', cleanup, { once: true });
        } catch (err) {
          // ignore -- the timeout below still cleans up
        }
        setTimeout(cleanup, 15000);
      }
    }, { once: true });

    document.body.appendChild(iframe);
    iframe.srcdoc = html;
  });
}
