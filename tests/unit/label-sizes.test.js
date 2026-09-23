// tests/unit/label-sizes.test.js

const { LABEL_SIZES, findLabelSize, DEFAULT_LABEL_SIZE_ID } = require('../../assets/js/modules/labels/label-sizes');

describe('label size presets', () => {
  test('the default size id resolves to a real preset', () => {
    expect(findLabelSize(DEFAULT_LABEL_SIZE_ID)).not.toBeNull();
  });

  test('an unknown id resolves to null rather than throwing', () => {
    expect(findLabelSize('does-not-exist')).toBeNull();
  });

  test('every preset id is unique', () => {
    const ids = LABEL_SIZES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('the 2 x 1 inch / 50.8 x 25.4 mm 2UP roll preset', () => {
    const size = findLabelSize('roll-50.8x25.4-2up');

    test('exists, using the precise metric conversion rather than a rounded 50 x 25', () => {
      expect(size).not.toBeNull();
      expect(size.kind).toBe('roll');
      expect(size.widthMm).toBe(50.8);
      expect(size.heightMm).toBe(25.4);
    });

    test('is distinct from the separately-sold, genuinely-rounded 50 x 25 mm roll', () => {
      const rounded = findLabelSize('roll-50x25');
      expect(rounded).not.toBeNull();
      expect(rounded.widthMm).toBe(50);
      expect(rounded.heightMm).toBe(25);
      expect(rounded.id).not.toBe(size.id);
    });

    test('declares a default "across" of 2, matching how this stock is actually sold/printed', () => {
      expect(size.defaultAcross).toBe(2);
    });
  });

  test('presets without a stated defaultAcross leave it undefined (single-lane assumed)', () => {
    const single = findLabelSize('roll-38x25');
    expect(single.defaultAcross).toBeUndefined();
  });
});
