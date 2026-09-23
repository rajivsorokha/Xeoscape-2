// assets/js/shared/print-utils.js
//
// Sends a self-contained HTML document to the printer WITHOUT opening
// a new window/popup.
//
// History of why this looks the way it does, because both easier-
// looking approaches were tried and failed on real hardware:
//
// 1. `window.open('', '_blank')`, printed into that new window. Works
//    in a normal browser tab, but this app ships as a Tauri desktop
//    app: the "browser" is really Tauri's own WebView2 (Windows) /
//    WebKit (mac) shell. A bare `window.open()` there does NOT create
//    a real window unless the app explicitly grants a "create webview
//    window" permission in src-tauri/capabilities and wires up a
//    handler for it in Rust -- neither of which this app does.
//    Without that, `window.open()` just returns null (or a window
//    that never receives content), which looks and feels exactly like
//    "the browser blocked the pop-up", even though no popup blocker
//    was actually involved -- which is why enabling "Allow pop-ups"
//    in Windows/Edge settings never fixed anything on other PCs.
//
// 2. A hidden `<iframe>` with `iframe.contentWindow.print()`, to print
//    something other than the current page without opening a new
//    window. This works in ordinary desktop browsers, but on WebView2
//    it printed a correctly-formed, otherwise-empty page carrying the
//    MAIN window's own title and URL in the header/footer -- i.e.
//    WebView2 does not scope `contentWindow.print()` to the iframe the
//    way desktop Chrome does; it just prints the top-level window,
//    which had nothing relevant on screen at the time. No amount of
//    iframe sizing/visibility tweaking changes that; it's a real
//    WebView2 limitation.
//
// What actually works: print the main window itself (`window.print()`,
// which every runtime supports unconditionally) but temporarily inject
// the label/receipt HTML into the current page and use `@media print`
// rules to hide everything else in the app for that one print. This
// is the standard "print only this element" technique, and since it
// never touches a second window or frame, it isn't exposed to either
// of the failure modes above.

let styleEl = null;
let containerEl = null;

function cleanupPrintArea() {
  containerEl?.remove();
  styleEl?.remove();
  containerEl = null;
  styleEl = null;
}

/**
 * Extracts the <style> rules and <body> markup out of a complete HTML
 * document string, so they can be spliced into the live app page
 * rather than a separate window/frame.
 */
function splitDocument(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const styleText = Array.from(doc.querySelectorAll('style')).map((s) => s.textContent).join('\n');
  const bodyHtml = doc.body ? doc.body.innerHTML : html;
  return { styleText, bodyHtml };
}

/**
 * Prints `html` (a complete HTML document, e.g. from
 * modules/labels/label-sheet.js or modules/checkout/receipt.js)
 * without opening a new window/popup and without depending on
 * cross-frame print scoping. See the file header for why.
 *
 * @param {string} html a complete HTML document (<html>...</html>)
 * @returns {Promise<void>} resolves once the print dialog has closed
 *   (or after a fallback timeout, if a given runtime doesn't fire
 *   `afterprint`)
 */
export function printHtml(html) {
  return new Promise((resolve) => {
    // In case a previous call's cleanup was somehow skipped.
    cleanupPrintArea();

    const { styleText, bodyHtml } = splitDocument(html);

    containerEl = document.createElement('div');
    containerEl.id = 'app-print-area';
    containerEl.innerHTML = bodyHtml;
    // Hidden during normal use; the stylesheet below is what reveals
    // it, and only while an actual print is in progress -- so it never
    // affects the on-screen app the rest of the time.
    containerEl.style.display = 'none';

    styleEl = document.createElement('style');
    styleEl.id = 'app-print-style';
    styleEl.textContent = `
/* The injected content now shares the live app page (see the file
   header) instead of a truly separate document, which means the
   app's own stylesheets (bootstrap.min.css, core.css,
   components.css -- all still loaded on this page) are in scope and
   can leak into it: a font-size, line-height or box-sizing rule
   meant for the app's UI can end up applying to a label or receipt
   element with a matching tag/class name, and win over that
   document's own styling if the app's rule happens to have equal or
   higher specificity. That's a real bug that showed up as an
   oversized/misplaced label on a physical printout.
   The :where() wrapper gives this reset rule ZERO specificity, so it
   only ever supplies a fallback -- any actual rule from the printed
   document below (they all use plain class/id selectors, specificity
   > 0) still wins for whatever properties it sets. What's left
   without a specific rule reverts to the browser's own defaults
   rather than inheriting whatever the app's stylesheets happened to
   set on similarly-named elements.
   SVG (the barcode itself, from shared/barcode.js) is explicitly
   excluded: its <svg>/<rect>/<text> elements are sized entirely via
   XML attributes (width="40mm", x="...", etc.), not CSS -- but an
   SVG root element's width/height attributes are technically treated
   as low-priority CSS "presentation hints" under the hood, and
   "revert" undoes those along with everything else, snapping the
   barcode back to the browser's true default SVG size (300x150px --
   much bigger than any label) instead of the intended physical
   dimensions. Since the barcode is already fully self-described by
   its own attributes, it needs no CSS reset at all. */
:where(#app-print-area, #app-print-area *):not(svg, svg *) { all: revert; }
${styleText}
@media print {
  body > *:not(#app-print-area) { display: none !important; }
  #app-print-area {
    display: block !important;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    margin: 0;
  }
}
    `;

    document.head.appendChild(styleEl);
    document.body.appendChild(containerEl);

    // Let layout settle before printing -- calling print() in the same
    // tick as inserting the content can catch it mid-render.
    requestAnimationFrame(() => {
      const cleanup = () => { cleanupPrintArea(); resolve(); };
      window.addEventListener('afterprint', cleanup, { once: true });
      // Fallback in case a given webview doesn't fire afterprint.
      setTimeout(cleanup, 15000);
      window.print();
    });
  });
}
