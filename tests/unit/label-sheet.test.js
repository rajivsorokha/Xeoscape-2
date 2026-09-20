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
