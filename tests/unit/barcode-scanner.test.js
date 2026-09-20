// tests/unit/barcode-scanner.test.js
//
// Exercises the pure scan-vs-typing detector behind
// assets/js/shared/barcode-scanner.js directly, with plain
// key/timestamp values, rather than simulating real keyboard events --
// this file is what actually decides whether a burst of keystrokes
// (from a USB HID scanner like the Dcode DC7132, or from a person
// typing) counts as a completed scan.

import { createScanDetector, MAX_INTERVAL_MS, MIN_SCAN_LENGTH } from '../../assets/js/shared/barcode-scanner.js';

/** Feeds a string's characters in at `gapMs` apart, then Enter. */
function typeScan(detector, text, gapMs, startTime = 1000) {
  let now = startTime;
  let result = null;
  for (const ch of text) {
    result = detector.handleKey(ch, now);
    now += gapMs;
  }
  result = detector.handleKey('Enter', now);
  return result;
}

describe('barcode scan detector', () => {
  let detector;

  beforeEach(() => {
    detector = createScanDetector();
  });

  test('a fast keystroke burst ending in Enter is reported as a scan', () => {
    const code = typeScan(detector, '2000000000015', 5);
    expect(code).toBe('2000000000015');
  });

  test('a fast burst ending in Tab is also reported as a scan', () => {
    let now = 1000;
    'ABC-123'.split('').forEach((ch) => { detector.handleKey(ch, now); now += 5; });
    expect(detector.handleKey('Tab', now)).toBe('ABC-123');
  });

  test('normal human typing speed is left alone (not reported as a scan)', () => {
    // Comfortably above MAX_INTERVAL_MS between keys.
    const code = typeScan(detector, '2000000000015', MAX_INTERVAL_MS * 3);
    expect(code).toBeNull();
  });

  test('hitting Enter with nothing typed is not a scan', () => {
    expect(detector.handleKey('Enter', 1000)).toBeNull();
  });

  test('a burst shorter than MIN_SCAN_LENGTH is not treated as a scan', () => {
    const shortText = '1'.repeat(MIN_SCAN_LENGTH - 1);
    const code = typeScan(detector, shortText, 5);
    expect(code).toBeNull();
  });

  test('a burst right at MIN_SCAN_LENGTH is treated as a scan', () => {
    const text = '1'.repeat(MIN_SCAN_LENGTH);
    const code = typeScan(detector, text, 5);
    expect(code).toBe(text);
  });

  test('slow typing followed by a fast finish does not retroactively count the slow part', () => {
    let now = 1000;
    // Slow, human-speed keys first...
    detector.handleKey('9', now); now += 300;
    detector.handleKey('9', now); now += 300;
    // ...then a fast burst starts fresh (buffer reset by the big gap).
    'ABC123'.split('').forEach((ch) => { detector.handleKey(ch, now); now += 5; });
    const code = detector.handleKey('Enter', now);
    expect(code).toBe('ABC123'); // not '99ABC123'
  });

  test('a Shift keydown mid-burst does not break or reset the scan', () => {
    let now = 1000;
    detector.handleKey('A', now); now += 5;
    detector.handleKey('Shift', now); now += 2; // modifier key, part of typing an uppercase char
    detector.handleKey('B', now); now += 5;
    detector.handleKey('C', now); now += 5;
    expect(detector.handleKey('Enter', now)).toBe('ABC');
  });

  test('the buffer resets after a completed scan, so back-to-back scans both work', () => {
    const first = typeScan(detector, '111111', 5, 1000);
    const second = typeScan(detector, '222222', 5, 5000);
    expect(first).toBe('111111');
    expect(second).toBe('222222');
  });

  test('a completed non-scan (slow) Enter clears the buffer for the next attempt', () => {
    typeScan(detector, '999999', MAX_INTERVAL_MS * 3, 1000); // slow -> not a scan, buffer clears
    const code = typeScan(detector, '111111', 5, 5000); // fast -> should be a clean scan
    expect(code).toBe('111111');
  });
});
