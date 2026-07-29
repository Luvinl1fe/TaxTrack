import {
  InvalidAmountError,
  centsToInput,
  formatCents,
  parseAmountToCents,
} from '@/lib/money';

describe('formatCents', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [50, '$0.50'],
    [100, '$1.00'],
    [4995, '$49.95'],
    [123456, '$1,234.56'],
    [100000000, '$1,000,000.00'],
  ])('%d → %s', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it('formats negatives with the sign outside the dollar symbol', () => {
    expect(formatCents(-4995)).toBe('-$49.95');
  });

  it('refuses non-integer cents rather than rendering a rounded lie', () => {
    expect(() => formatCents(49.5)).toThrow(TypeError);
  });
});

describe('centsToInput', () => {
  it.each([
    [4995, '49.95'],
    [100, '1.00'],
    [5, '0.05'],
    [123456, '1234.56'],
  ])('%d → %s (no symbol, no grouping)', (cents, expected) => {
    expect(centsToInput(cents)).toBe(expected);
  });
});

describe('parseAmountToCents', () => {
  it.each([
    ['49.95', 4995],
    ['$49.95', 4995],
    ['  49.95  ', 4995],
    ['49', 4900],
    ['0.05', 5],
    ['1,234.56', 123456],
    ['$1,234.56', 123456],
  ])('%s → %d cents', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  // The float trap this module exists to avoid: 49.95 * 100 is
  // 4994.999999999999, so Math.round is doing real work in the naive version.
  it.each([
    ['0.07', 7],
    ['0.29', 29],
    ['1.10', 110],
    ['8.20', 820],
    ['49.95', 4995],
    ['1.15', 115],
    ['2.35', 235],
  ])('%s parses exactly to %d cents', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  it('reads a single decimal digit as tenths, not hundredths', () => {
    expect(parseAmountToCents('5.5')).toBe(550);
    expect(parseAmountToCents('0.5')).toBe(50);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace'],
    ['abc', 'letters'],
    ['12.345', 'three decimal places'],
    ['1 2', 'an internal space'],
    ['-5.00', 'a negative'],
    ['1..5', 'a doubled point'],
    ['.5', 'a leading point'],
    ['5.', 'a trailing point'],
    ['1,23.45', 'misplaced grouping'],
    ['0', 'zero'],
    ['0.00', 'zero with decimals'],
  ])('rejects %s (%s)', (input) => {
    expect(() => parseAmountToCents(input)).toThrow(InvalidAmountError);
  });

  it('gives a message a user can act on', () => {
    expect(() => parseAmountToCents('abc')).toThrow('Enter an amount like 49.95.');
  });
});

describe('round trip', () => {
  it.each([1, 5, 99, 100, 4995, 123456, 999999])(
    '%d cents survives centsToInput → parseAmountToCents',
    (cents) => {
      expect(parseAmountToCents(centsToInput(cents))).toBe(cents);
    },
  );
});
