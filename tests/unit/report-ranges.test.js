// tests/unit/report-ranges.test.js

const { resolveRange } = require('../../core/report-ranges');

describe('resolveRange', () => {
  const fixedNow = new Date('2026-07-21T15:30:00.000Z');

  test('today returns the start and end of the current day', () => {
    const { from, to, label } = resolveRange('today', fixedNow);
    expect(label).toBe('Today');
    expect(new Date(from).toDateString()).toBe(fixedNow.toDateString());
    expect(new Date(to).toDateString()).toBe(fixedNow.toDateString());
    expect(new Date(from).getHours()).toBe(0);
    expect(new Date(to).getHours()).toBe(23);
  });

  test('2days spans yesterday through today', () => {
    const { from, to } = resolveRange('2days', fixedNow);
    const spanDays = Math.round((new Date(to) - new Date(from)) / (24 * 60 * 60 * 1000));
    expect(spanDays).toBe(2);
  });

  test('week spans 7 days', () => {
    const { from, to } = resolveRange('week', fixedNow);
    const spanDays = Math.round((new Date(to) - new Date(from)) / (24 * 60 * 60 * 1000));
    expect(spanDays).toBe(7);
  });

  test('month spans 30 days', () => {
    const { from, to } = resolveRange('month', fixedNow);
    const spanDays = Math.round((new Date(to) - new Date(from)) / (24 * 60 * 60 * 1000));
    expect(spanDays).toBe(30);
  });

  test('rejects an unknown preset', () => {
    expect(() => resolveRange('yearly', fixedNow)).toThrow('Unknown report range');
  });
});
