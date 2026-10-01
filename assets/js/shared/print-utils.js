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

const PRINT_AREA_ID = 'app-print-area';

let styleEl = null;
let containerEl = null;

function cleanupPrintArea() {
  containerEl?.remove();
  styleEl?.remove();
  containerEl = null;
  styleEl = null;
}

/** Resolves once every <img> under `root` has loaded or failed, or after `timeoutMs`. */
function waitForImages(root, timeoutMs = 1500) {
  const images = Array.from(root.querySelectorAll('img'));
  if (!images.length) return Promise.resolve();
  const settled = images.map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  })));
  return Promise.race([
    Promise.all(settled),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

/**
 * Measures how tall the print content actually renders (a store logo
 * or a long item list makes this different every time) and bakes that
 * measurement into the `@page` rule in place of the invalid
 * `<length> auto` pairing -- see PAGE_AUTO_HEIGHT_RE above.
 *
 * Rendered off-screen (`position:fixed; left:-10000px`) rather than
 * `display:none`, since a display:none element has no box to measure
 * -- it needs to actually lay out, just not be visible while it does.
 *
 * @returns {string} styleText, with `auto` replaced by a concrete
 *   height when the pattern is present; unchanged otherwise.
 */
async function resolveAutoPageHeight(styleText, containerEl) {
  if (!PAGE_AUTO_HEIGHT_RE.test(styleText)) return styleText;

  const prevCssText = containerEl.style.cssText;
  containerEl.style.cssText = 'display:block;position:fixed;left:-10000px;top:0;visibility:hidden;';

  await waitForImages(containerEl);
  // One more frame so the browser has actually laid the content out
  // with its final styles/images before scrollHeight is read.
  await new Promise((resolve) => requestAnimationFrame(resolve));

  // A couple of mm of slack: the measurement is taken at screen (96
  // CSS px/in) scale and rounds down a hair versus the print engine's
  // own layout, and it's far better to feed one blank line than to
  // clip the last line of a receipt.
  const PX_PER_MM = 96 / 25.4;
  const heightMm = Math.ceil(containerEl.scrollHeight / PX_PER_MM) + 3;

  containerEl.style.cssText = prevCssText;

  return styleText.replace(PAGE_AUTO_HEIGHT_RE, `$1${heightMm}mm$2`);
}

/**
 * Extracts the <style> rules and <body> markup out of a complete HTML
 * document string, so they can be spliced into the live app page
 * rather than a separate window/frame.
 *
 * The documents built by label-sheet.js and receipt.js are written as
 * *standalone* documents -- `html, body { ... }` is correct there,
 * because label-sheet.js's HTML doubles as an <iframe srcdoc="..."> for
 * the live preview, where it really does own a whole document. But
 * once that same HTML is spliced into THIS page's real <html>/<body>
 * (see the file header for why it's done this way), a bare `html` or
 * `body` selector no longer means "the printed document's root" -- it
 * means the app's actual root, so a receipt's `width: 80mm` or a
 * label sheet's `background: #fff` would apply to the whole running
 * app the moment Print is clicked, not just the printed area. That's
 * a real bug: the on-screen app visibly collapses to receipt width
 * for as long as the print dialog is open. Rewriting those selectors
 * to target the print container instead keeps both use sites correct
 * without having to make label-sheet.js/receipt.js aware of which
 * consumer is reading their output.
 */
function scopeHtmlBodySelectors(cssText) {
  return cssText
    .replace(/\bhtml\s*,\s*body\b/g, `#${PRINT_AREA_ID}`)
    .replace(/(^|[\s{},])body(?=[\s{},])/g, `$1#${PRINT_AREA_ID}`);
}

function splitDocument(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const styleText = scopeHtmlBodySelectors(
    Array.from(doc.querySelectorAll('style')).map((s) => s.textContent).join('\n')
  );
  const bodyHtml = doc.body ? doc.body.innerHTML : html;
  return { styleText, bodyHtml };
}

// Matches the `@page { size: <width>mm auto; ... }` pattern used for
// continuous thermal roll stock (receipt.js), where the page is a
// fixed width but an unknown height until the content is laid out.
// `auto` paired with an explicit length isn't valid CSS -- the `size`
// descriptor is either a bare keyword (auto/portrait/landscape/a
// <page-size> name) or one-or-two <length>s, never a mix (see
// https://developer.mozilla.org/docs/Web/CSS/@page/size). An invalid
// declaration is simply dropped, which leaves the page at its
// initial size -- normally the printer/driver's default sheet (A4,
// Letter...), not the 80mm roll. On a continuous-feed thermal
// printer that prints as a long blank run of paper after the actual
// receipt content, which is exactly the "gap" a physical print shows.
// Rather than gamble on a given engine special-casing this pairing,
// PAGE_AUTO_HEIGHT_RE below finds it so the real height can be
// measured from the laid-out content and substituted in as a plain
// number before printing -- valid on every engine.
const PAGE_AUTO_HEIGHT_RE = /(@page\s*\{[^}]*size:\s*[\d.]+mm\s+)auto(\s*;[^}]*\})/i;

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
  return new Promise((resolve, reject) => {
    // In case a previous call's cleanup was somehow skipped.
    cleanupPrintArea();

    const { styleText: scopedStyleText, bodyHtml } = splitDocument(html);

    containerEl = document.createElement('div');
    containerEl.id = PRINT_AREA_ID;
    containerEl.innerHTML = bodyHtml;
    // Hidden during normal use; the stylesheet below is what reveals
    // it, and only while an actual print is in progress -- so it never
    // affects the on-screen app the rest of the time. Appended before
    // the auto-height measurement below so that pass has real, styled
    // content to lay out and measure.
    containerEl.style.display = 'none';
    document.body.appendChild(containerEl);

    resolveAutoPageHeight(scopedStyleText, containerEl).then((styleText) => {
      finishPrint(styleText, resolve, reject);
    }).catch(reject);
  });
}

function finishPrint(styleText, resolve, reject) {
  try {
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
    /* No width/margin forced here: label-sheet.js and receipt.js each
       size and centre their own content (now correctly scoped to
       #app-print-area -- see scopeHtmlBodySelectors above), and a
       blanket width:100% here would override a receipt's deliberate
       80mm and reopen the exact "blank gap" bug this file fixes. */
  }
}
    `;

    document.head.appendChild(styleEl);

    // Let layout settle before printing -- calling print() in the same
    // tick as inserting the content can catch it mid-render.
    requestAnimationFrame(() => {
      const cleanup = () => { cleanupPrintArea(); resolve(); };
      window.addEventListener('afterprint', cleanup, { once: true });
      // Fallback in case a given webview doesn't fire afterprint.
      setTimeout(cleanup, 15000);
      window.print();
    });
  } catch (err) {
    cleanupPrintArea();
    reject(err);
  }
}
