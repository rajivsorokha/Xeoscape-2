// tests/unit/label-sheet.test.js
//
// Frontend module, but plain JS with no DOM access -- babel.config.js
// transforms its import/export syntax so Jest can exercise it directly.

const { buildLabelSheetHtml } = require('../../assets/js/modules/labels/label-sheet');
const { findLabelSize } = require('../../assets/js/modules/labels/label-sizes');

const item = () => ({ code: 'TSHI-BLU-S-0001', garmentType: 'T-Shirt', color: 'blue', size: 'S', price: 255 });

describe('multi-across roll printing', () => {
  const rollSize = findLabelSize('roll-38x25'); // 38 x 25mm

  test('defaults to single-lane (labelsAcross omitted) -- unchanged from before this feature', () => {
    const html = buildLabelSheetHtml([item(), item()], rollSize, { symbology: 'CODE128' });
    expect(html).not.toContain('roll-row');
    expect(html.match(/@page \{[^}]*\}/)[0]).toBe('@page { size: 38mm 25mm; margin: 0; }');
  });

  test('2 across doubles the page width and adds the connecting gap', () => {
    const html = buildLabelSheetHtml([item(), item()], rollSize, { symbology: 'CODE128' }, 0, 2);
    // 38 * 2 + 2mm gap = 78mm
    expect(html.match(/@page \{[^}]*\}/)[0]).toBe('@page { size: 78.00mm 25mm; margin: 0; }');
  });

  test('lays out labels in full rows of `across`', () => {
    const html = buildLabelSheetHtml([item(), item(), item(), item()], rollSize, { symbology: 'CODE128' }, 0, 2);
    const body = html.slice(html.indexOf('<body>'));
    expect((body.match(/class="roll-row"/g) || [])).toHaveLength(2);
    expect((body.match(/<div class="label">/g) || [])).toHaveLength(4);
    expect((body.match(/<div class="label label-blank">/g) || [])).toHaveLength(0);
  });

  test('pads an incomplete final row with a hidden filler, not a narrower page', () => {
    // 3 items, 2 across -> row 1 full, row 2 has one real label + one filler
    const html = buildLabelSheetHtml([item(), item(), item()], rollSize, { symbology: 'CODE128' }, 0, 2);
    const body = html.slice(html.indexOf('<body>'));
    expect((body.match(/class="roll-row"/g) || [])).toHaveLength(2);
    expect((body.match(/<div class="label">/g) || [])).toHaveLength(3);
    expect((body.match(/<div class="label label-blank">/g) || [])).toHaveLength(1);
  });

  test('3 and 4 across scale the page width the same way', () => {
    const html3 = buildLabelSheetHtml([item()], rollSize, { symbology: 'CODE128' }, 0, 3);
    expect(html3.match(/@page \{[^}]*\}/)[0]).toBe('@page { size: 118.00mm 25mm; margin: 0; }'); // 38*3+2*2

    const html4 = buildLabelSheetHtml([item()], rollSize, { symbology: 'CODE128' }, 0, 4);
    expect(html4.match(/@page \{[^}]*\}/)[0]).toBe('@page { size: 158.00mm 25mm; margin: 0; }'); // 38*4+2*3
  });

  test('sheet stock ignores labelsAcross -- it already has its own column count', () => {
    const sheetSize = findLabelSize('sheet-a4-65');
    const withAcross = buildLabelSheetHtml([item()], sheetSize, { symbology: 'CODE128' }, 0, 2);
    const withoutAcross = buildLabelSheetHtml([item()], sheetSize, { symbology: 'CODE128' }, 0, 1);
    expect(withAcross).toBe(withoutAcross);
    expect(withAcross).not.toContain('roll-row');
  });

  test('an invalid labelsAcross value falls back to 1 rather than breaking layout', () => {
    const html = buildLabelSheetHtml([item()], rollSize, { symbology: 'CODE128' }, 0, 0);
    expect(html.match(/@page \{[^}]*\}/)[0]).toBe('@page { size: 38mm 25mm; margin: 0; }');
    expect(html).not.toContain('roll-row');
  });
});

describe('printer rotation compensation', () => {
  const rollSize = findLabelSize('roll-38x25'); // 38 x 25mm

  test('rotate omitted (or "none") leaves the page size and markup exactly as before', () => {
    const withDefault = buildLabelSheetHtml([item()], rollSize, { symbology: 'CODE128' });
    const withExplicitNone = buildLabelSheetHtml([item()], rollSize, { symbology: 'CODE128' }, 0, 1, 'none');
    expect(withDefault).toBe(withExplicitNone);
    expect(withDefault).not.toContain('page-rotate-outer');
    expect(withDefault.match(/@page \{[^}]*\}/)[0]).toBe('@page { size: 38mm 25mm; margin: 0; }');
  });

  test('"cw" swaps the declared page dimensions and rotates the content the opposite way', () => {
    const html = buildLabelSheetHtml([item()], rollSize, { symbology: 'CODE128' }, 0, 1, 'cw');
    // Page is now 25 x 38 (swapped from the stock's real 38 x 25) so
    // that after the printer's own 90-degree rotation it lands back at
    // the true 38 x 25 physical label.
    expect(html.match(/@page \{[^}]*\}/)[0]).toBe('@page { size: 25mm 38mm; margin: 0; }');
    expect(html).toContain('page-rotate-outer');
    expect(html).toContain('rotate(90deg) translateY(-100%)');
    // The rotated inner content keeps the label's real, unrotated size.
    expect(html).toMatch(/width:38mm;height:25mm;\s*transform-origin:top left;/);
  });

  test('"ccw" rotates the other direction instead', () => {
    const html = buildLabelSheetHtml([item()], rollSize, { symbology: 'CODE128' }, 0, 1, 'ccw');
    expect(html.match(/@page \{[^}]*\}/)[0]).toBe('@page { size: 25mm 38mm; margin: 0; }');
    expect(html).toContain('rotate(-90deg) translateX(-100%)');
  });

  test('rotation swaps a sheet page\'s dimensions too', () => {
    const sheetSize = findLabelSize('sheet-a4-65');
    const html = buildLabelSheetHtml([item()], sheetSize, { symbology: 'CODE128' }, 0, 1, 'cw');
    const expectedSwapped = `@page { size: ${sheetSize.pageHeightMm}mm ${sheetSize.pageWidthMm}mm; margin: 0; }`;
    expect(html.match(/@page \{[^}]*\}/)[0]).toBe(expectedSwapped);
    expect(html).toContain('page-rotate-outer');
    // The .sheet grid itself keeps its real, unrotated dimensions --
    // only the wrapper around it is swapped/rotated.
    expect(html).toContain(`width: ${sheetSize.pageWidthMm}mm;`);
    expect(html).toContain(`height: ${sheetSize.pageHeightMm}mm;`);
  });

  test('rotation swaps a multi-across roll row\'s dimensions using the same widened width as before', () => {
    const html = buildLabelSheetHtml([item(), item()], rollSize, { symbology: 'CODE128' }, 0, 2, 'cw');
    // 38 * 2 + 2mm gap = 78.00mm, now in the swapped/height position.
    expect(html.match(/@page \{[^}]*\}/)[0]).toBe('@page { size: 25mm 78.00mm; margin: 0; }');
    expect(html).toContain('roll-row');
    expect(html).toContain('page-rotate-outer');
  });

  test('pagination moves to the rotation wrapper: every unit but the last breaks the page', () => {
    const html = buildLabelSheetHtml([item(), item(), item()], rollSize, { symbology: 'CODE128' }, 0, 1, 'cw');
    const wrapperOpenTags = html.match(/<div class="page-rotate-outer"[^>]*>/g) || [];
    expect(wrapperOpenTags).toHaveLength(3);
    // First two units break the page; the last one doesn't (so the
    // printer doesn't eject a blank label after the final one).
    expect(wrapperOpenTags[0]).toContain('page-break-after:always');
    expect(wrapperOpenTags[1]).toContain('page-break-after:always');
    expect(wrapperOpenTags[2]).not.toContain('page-break-after:always');
    // The plain, unrotated .label/.sheet CSS rules no longer carry
    // their own page-break-after -- that would double up with the
    // wrapper's.
    expect(html).not.toMatch(/\.label\s*\{[^}]*page-break-after/);
  });
});
