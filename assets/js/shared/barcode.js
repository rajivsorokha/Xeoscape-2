// assets/js/shared/barcode.js
// Self-contained barcode encoding + SVG rendering. Deliberately has no
// dependencies: the app ships as a packaged offline desktop build (see
// src-tauri/), so pulling a barcode library off a CDN at print time
// would mean labels silently stop rendering on a till with no
// internet. Everything here is plain arithmetic over lookup tables.
//
// Two symbologies are supported, which between them cover garment
// retail:
//   * CODE128  -- variable length, any ASCII 32..126. Use for internal
//                 SKUs like "SHRT-BLU-M-0042". Every retail scanner
//                 reads it.
//   * EAN13    -- fixed 13 digits (12 + a check digit). Use when the
//                 garment carries a real trade barcode, or when you
//                 want in-store codes in the 20..29 "restricted
//                 distribution" prefix range that GS1 reserves
//                 precisely for this.
//
// Both encoders return a module array: a list of 1/0 values, one per
// narrow bar width ("module"), 1 = bar, 0 = space. toSvg() then draws
// that at whatever physical width the label needs.
//
// This module only reads and draws codes. *Allocating* a new unique
// code lives server-side in core/barcode.js, because uniqueness can
// only be checked against the product catalogue -- see
// POST /api/inventory/barcodes/generate.

// --- CODE128 -----------------------------------------------------------

// The 107 CODE128 symbol patterns, indexed by symbol value. Each entry
// is the run-length encoding of one symbol, starting with a bar and
// alternating bar/space (e.g. "212222" = 2 bar, 1 space, 2 bar, 2
// space, 2 bar, 2 space). Values 0..102 are data/function symbols,
// 103..105 are Start A/B/C, and 106 is the stop pattern (7 runs, not 6).
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

const CODE128_CODE_C = 99;  // switch to subset C from B
const CODE128_CODE_B = 100; // switch to subset B from C
const CODE128_START_B = 104;
const CODE128_START_C = 105;
const CODE128_STOP = 106;

/**
 * Expands a run-length pattern string into modules, starting with a
 * bar and alternating. "212222" -> [1,1, 0, 1,1, 0,0, 1,1, 0,0].
 */
function patternToModules(pattern) {
  const modules = [];
  for (let i = 0; i < pattern.length; i += 1) {
    const runLength = Number(pattern[i]);
    const isBar = i % 2 === 0;
    for (let n = 0; n < runLength; n += 1) modules.push(isBar ? 1 : 0);
  }
  return modules;
}

function symbolsToModules(symbolValues) {
  const modules = [];
  symbolValues.forEach((value) => {
    modules.push(...patternToModules(CODE128_PATTERNS[value]));
  });
  return modules;
}

/**
 * CODE128 check character: (startValue + sum(position * value)) % 103,
 * where position counts from 1 for the first data symbol.
 */
function code128Checksum(symbolValues) {
  const total = symbolValues.reduce(
    (sum, value, index) => sum + (index === 0 ? value : value * index),
    0
  );
  return total % 103;
}

/**
 * Decides where to use subset C (two digits per symbol) instead of
 * subset B (one character per symbol). Subset C halves the width of a
 * digit run, which matters a lot here: garment label stock is often
 * only 25-38mm wide, and a code that overflows it either prints
 * clipped or has to be shrunk until a scanner can't read it.
 *
 * The usual rule of thumb, which this follows: a run of 4+ digits is
 * worth switching for at the very start or very end of the value, but
 * mid-string you need 6+ to win back the cost of the two switch
 * symbols. Runs are consumed in pairs, so an odd-length run leaves its
 * first digit behind in subset B.
 *
 * @param {string} text
 * @returns {number[]} CODE128 symbol values, without checksum or stop
 */
function planCode128Symbols(text) {
  const digitRunLength = (from) => {
    let length = 0;
    while (from + length < text.length && text[from + length] >= '0' && text[from + length] <= '9') length += 1;
    return length;
  };

  const symbols = [];
  let inSubsetC = false;
  let position = 0;

  const startRun = digitRunLength(0);
  if (startRun >= 4) {
    symbols.push(CODE128_START_C);
    inSubsetC = true;
  } else {
    symbols.push(CODE128_START_B);
  }

  while (position < text.length) {
    const run = digitRunLength(position);
    const reachesEnd = position + run === text.length;
    const worthSwitching = run >= 6 || (run >= 4 && (position === 0 || reachesEnd));

    if (run >= 2 && (inSubsetC || worthSwitching)) {
      if (!inSubsetC) {
        symbols.push(CODE128_CODE_C);
        inSubsetC = true;
      }
      // Consume an even number of digits; an odd tail digit goes back
      // to subset B below.
      const pairs = Math.floor(run / 2);
      for (let i = 0; i < pairs; i += 1) {
        symbols.push(Number(text.slice(position, position + 2)));
        position += 2;
      }
      continue;
    }

    if (inSubsetC) {
      symbols.push(CODE128_CODE_B);
      inSubsetC = false;
    }

    const char = text[position];
    const charCode = char.charCodeAt(0);
    if (charCode < 32 || charCode > 126) {
      throw new Error(`CODE128 can't encode "${char}" -- use plain letters, digits, spaces or -./+ symbols.`);
    }
    symbols.push(charCode - 32);
    position += 1;
  }

  return symbols;
}

/**
 * Encodes a value as CODE128, mixing subsets B and C so digit runs
 * print as compactly as possible (see planCode128Symbols).
 *
 * @param {string} value - any ASCII 32..126
 * @returns {number[]} module array (1 = bar, 0 = space)
 */
export function encodeCode128(value) {
  const text = String(value);
  if (!text.length) throw new Error('Nothing to encode.');

  const symbols = planCode128Symbols(text);
  symbols.push(code128Checksum(symbols));
  symbols.push(CODE128_STOP);
  return symbolsToModules(symbols);
}

// --- EAN-13 ------------------------------------------------------------

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];

// Which of L/G encodes each of digits 2..7, chosen by the first digit.
// This parity pattern is how the (otherwise unprinted) first digit is
// actually carried in the symbol.
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/**
 * EAN-13 check digit for the first 12 digits: weight alternating
 * 1,3,1,3..., then the amount needed to reach the next multiple of 10.
 * @param {string} first12
 * @returns {number}
 */
export function ean13CheckDigit(first12) {
  const digits = String(first12).slice(0, 12).split('').map(Number);
  if (digits.length !== 12 || digits.some(Number.isNaN)) {
    throw new Error('An EAN-13 check digit needs exactly 12 digits.');
  }
  const sum = digits.reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/** True if `value` is 13 digits with a correct check digit. */
export function isValidEan13(value) {
  const text = String(value);
  if (!/^\d{13}$/.test(text)) return false;
  return ean13CheckDigit(text.slice(0, 12)) === Number(text[12]);
}

function bitsToModules(bits) {
  return bits.split('').map((bit) => (bit === '1' ? 1 : 0));
}

/**
 * Encodes 12 or 13 digits as EAN-13. A 12-digit value gets its check
 * digit appended automatically.
 * @param {string} value
 * @returns {{ modules: number[], text: string }}
 */
export function encodeEan13(value) {
  let text = String(value).replace(/\s|-/g, '');
  if (/^\d{12}$/.test(text)) text += String(ean13CheckDigit(text));
  if (!/^\d{13}$/.test(text)) {
    throw new Error('EAN-13 needs exactly 12 or 13 digits.');
  }
  if (!isValidEan13(text)) {
    throw new Error(`"${text}" has the wrong EAN-13 check digit -- the last digit should be ${ean13CheckDigit(text.slice(0, 12))}.`);
  }

  const digits = text.split('').map(Number);
  const parity = EAN_PARITY[digits[0]];

  let bits = '101'; // start guard
  for (let i = 1; i <= 6; i += 1) {
    bits += parity[i - 1] === 'L' ? EAN_L[digits[i]] : EAN_G[digits[i]];
  }
  bits += '01010'; // centre guard
  for (let i = 7; i <= 12; i += 1) {
    bits += EAN_R[digits[i]];
  }
  bits += '101'; // end guard

  return { modules: bitsToModules(bits), text };
}

// --- Rendering ---------------------------------------------------------

/**
 * Renders a module array as an SVG string sized in millimetres, so it
 * prints at a predictable physical size regardless of screen DPI.
 *
 * `quietZone` matters more than it looks: a barcode butted right up
 * against the edge of a label often won't scan at all, because the
 * reader needs blank space either side to find the symbol. 10 modules
 * is the usual minimum for CODE128.
 *
 * @param {number[]} modules
 * @param {object} options
 * @param {number} options.widthMm       total symbol width incl. quiet zones
 * @param {number} options.heightMm      bar height (excluding any caption)
 * @param {number} [options.quietZone]   quiet-zone width, in modules
 * @param {string} [options.caption]     human-readable text under the bars
 * @param {number} [options.captionMm]   caption font size in mm
 * @returns {string} SVG markup
 */
export function toSvg(modules, { widthMm, heightMm, quietZone = 10, caption = '', captionMm = 2.4 }) {
  const totalModules = modules.length + quietZone * 2;
  const moduleWidth = widthMm / totalModules;
  const captionHeight = caption ? captionMm * 1.35 : 0;
  const totalHeight = heightMm + captionHeight;

  // Adjacent same-colour modules are merged into one <rect>. A 13-digit
  // EAN is 95 modules, and one rect per module would make a 60-label
  // A4 sheet several thousand nodes -- slow to render and slow to spool
  // to the printer.
  let rects = '';
  let index = 0;
  while (index < modules.length) {
    if (modules[index] === 1) {
      let run = 1;
      while (modules[index + run] === 1) run += 1;
      const x = (quietZone + index) * moduleWidth;
      rects += `<rect x="${x.toFixed(4)}" y="0" width="${(run * moduleWidth).toFixed(4)}" height="${heightMm}" fill="#000"/>`;
      index += run;
    } else {
      index += 1;
    }
  }

  const captionEl = caption
    ? `<text x="${(widthMm / 2).toFixed(3)}" y="${(heightMm + captionMm).toFixed(3)}" `
      + `font-family="monospace" font-size="${captionMm}" letter-spacing="${(captionMm * 0.12).toFixed(3)}" `
      + `text-anchor="middle" fill="#000">${escapeXml(caption)}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${totalHeight.toFixed(3)}mm" `
    + `viewBox="0 0 ${widthMm} ${totalHeight.toFixed(3)}" shape-rendering="crispEdges">${rects}${captionEl}</svg>`;
}

function escapeXml(text) {
  return String(text).replace(/[<>&"']/g, (char) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]
  ));
}

/**
 * Encodes `value` in `symbology` and returns print-ready SVG. Throws a
 * message suitable for showing to a user if the value can't be encoded
 * (e.g. letters in a field set to EAN-13).
 *
 * @param {string} value
 * @param {'CODE128'|'EAN13'} symbology
 * @param {object} options - passed through to toSvg()
 * @returns {string} SVG markup
 */
export function barcodeSvg(value, symbology, options) {
  if (symbology === 'EAN13') {
    const { modules, text } = encodeEan13(value);
    // EAN-13's own spec fixes the quiet zone at 9-11 modules; 9 keeps
    // narrow 25mm label stock usable without dropping below spec.
    return toSvg(modules, { quietZone: 9, ...options, caption: options.caption === false ? '' : (options.caption || text) });
  }
  return toSvg(encodeCode128(value), options);
}
