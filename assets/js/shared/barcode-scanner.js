// assets/js/shared/barcode-scanner.js
//
// USB barcode scanners like the Dcode DC7132 need no driver: to
// Windows/macOS/Linux they show up as an ordinary USB keyboard ("HID
// keyboard wedge"). Pulling the trigger just types out the barcode's
// characters, one keystroke per character, followed by Enter -- all
// within a few milliseconds, far faster than anyone could type by
// hand. There's nothing to "install" for the scanner itself; plugging
// it in is the whole setup (Windows will show a generic "HID Keyboard
// Device" the first time -- that's expected, not a driver failure).
//
// The only real integration work is on this side: recognizing that
// burst of keystrokes as a scan rather than as normal typing, and
// acting on it no matter which element happens to have focus at the
// till, since a busy cashier won't always have clicked into the "Scan
// barcode" box first.
//
// This module listens for keydown globally, in the capture phase (so
// it sees every keystroke before whatever element is focused does),
// and when a burst of characters arrives faster than a human could
// type and ends in Enter/Tab, reports it via the registered handler
// and swallows those keystrokes so they don't also land in -- and
// double-submit -- whatever field was focused. Ordinary typing,
// including someone typing a barcode by hand into a text field, is
// left completely alone and behaves exactly as it did before.

// Consecutive keystrokes under this many ms apart are "scanner speed".
// A HID scanner in keyboard-wedge mode (like the DC7132) typically
// sends characters only a few ms apart; even fast manual typing
// averages well over 60-80ms between keys. 40ms comfortably separates
// the two without being so tight that a slightly slower/older scanner
// gets missed. If a particular unit is configured with an inter-
// character delay, raise this.
export const MAX_INTERVAL_MS = 40;

// A "scan" shorter than this is more likely a stray keystroke (e.g.
// someone hit Enter in an empty field) than a real barcode -- nothing
// this app generates is that short.
export const MIN_SCAN_LENGTH = 3;

// Which key ends a scan. DC7132 (and most HID scanners) default to
// sending Enter/CR as the suffix; Tab is accepted too since it's the
// other common configuration some scanners/stores use.
export const TERMINATOR_KEYS = new Set(['Enter', 'Tab']);

function isScanCandidateKey(key) {
  // Printable, single-character keys only -- letters, digits, and
  // symbols a barcode might contain. Modifier/navigation keys (Shift,
  // Control, CapsLock, arrows, ...) are ignored without resetting the
  // buffer or timer, since typing an uppercase letter still involves a
  // Shift keydown as part of the very same fast burst.
  return key.length === 1;
}

/**
 * The actual scan-vs-typing detection, kept free of any DOM/event API
 * so it can be unit tested with plain key/timestamp values (see
 * tests/unit/barcode-scanner.test.js) rather than simulated keyboard
 * events. `createScanDetector()` returns one detector with its own
 * buffer -- the module below keeps a single app-wide instance.
 */
export function createScanDetector() {
  let buffer = '';
  let lastKeyTime = 0;

  /**
   * Feed one keydown's key value and timestamp (ms) in.
   * @returns {string|null} the completed scan code, or null if this
   *   keystroke didn't finish one (either it's not done yet, or the
   *   burst that just ended didn't look like a scan).
   */
  function handleKey(key, now) {
    if (TERMINATOR_KEYS.has(key)) {
      const isFastBurst = buffer.length >= MIN_SCAN_LENGTH && (now - lastKeyTime) <= MAX_INTERVAL_MS;
      const code = isFastBurst ? buffer : null;
      buffer = '';
      return code;
    }

    if (!isScanCandidateKey(key)) return null; // let modifiers/navigation pass through untouched

    if (now - lastKeyTime > MAX_INTERVAL_MS) {
      // Gap too large to be the same burst -- this keystroke starts a
      // fresh (potential) scan rather than continuing what was
      // actually slow, human typing.
      buffer = '';
    }
    buffer += key;
    lastKeyTime = now;
    return null;
  }

  return { handleKey };
}

const detector = createScanDetector();
let handler = null;

function onKeyDown(e) {
  if (!handler) return; // no screen currently wants scans -- see setScanHandler

  const code = detector.handleKey(e.key, performance.now());
  if (code === null) return;

  // Stop this Enter/Tab from also reaching (and acting on) whatever
  // input happened to be focused -- the scan is handled exactly once,
  // here, regardless of focus.
  e.preventDefault();
  e.stopPropagation();
  handler(code);
}

let installed = false;
function ensureInstalled() {
  if (installed) return;
  installed = true;
  document.addEventListener('keydown', onKeyDown, true);
}

/**
 * Registers the function to call with the decoded text whenever a scan
 * is detected. Only one handler is active at a time -- last caller
 * wins -- matching how the app uses this: whichever screen is
 * currently showing (POS, a barcode-entry field, etc.) is the one that
 * should receive scans, and screens replace each other's handler as
 * the user navigates rather than stacking up.
 *
 * @param {((code: string) => void)|null} fn pass null to stop
 *   receiving scans, e.g. when navigating away from the screen that
 *   registered it.
 */
export function setScanHandler(fn) {
  ensureInstalled();
  handler = fn;
}
