import {
  currentFy,
  daysInMonth,
  fyBounds,
  fyLabel,
  fyStartYear,
  isInFy,
  isLeapYear,
  parseIsoDate,
  toIsoDate,
} from '@/lib/financialYear';

describe('fyStartYear', () => {
  // The boundary is the whole point of this module: one day either side of it
  // is the difference between two different tax returns.
  it('puts 1 July in the year that starts then', () => {
    expect(fyStartYear('2026-07-01')).toBe(2026);
  });

  it('puts 30 June in the year that ends then', () => {
    expect(fyStartYear('2026-06-30')).toBe(2025);
  });

  it('splits consecutive days across two financial years', () => {
    expect(fyStartYear('2026-06-30')).toBe(2025);
    expect(fyStartYear('2026-07-01')).toBe(2026);
  });

  it.each([
    ['2026-07-01', 2026],
    ['2026-08-15', 2026],
    ['2026-12-31', 2026],
    ['2027-01-01', 2026],
    ['2027-06-30', 2026],
    ['2027-07-01', 2027],
  ])('maps %s to FY %i', (date, expected) => {
    expect(fyStartYear(date)).toBe(expected);
  });

  it('handles 29 February in a leap year', () => {
    expect(fyStartYear('2028-02-29')).toBe(2027);
  });
});

describe('fyLabel', () => {
  it('formats a financial year with an en dash', () => {
    expect(fyLabel(2026)).toBe('2026–27');
  });

  it('pads a single-digit end year', () => {
    expect(fyLabel(2008)).toBe('2008–09');
  });

  it('wraps across a century boundary', () => {
    expect(fyLabel(2099)).toBe('2099–00');
  });

  it('does not corrupt years containing the end-year digits', () => {
    // Regression: an earlier implementation built the label via string
    // replacement and mangled years whose digits matched the suffix.
    expect(fyLabel(2027)).toBe('2027–28');
    expect(fyLabel(2019)).toBe('2019–20');
  });

  it('rejects a non-integer year', () => {
    expect(() => fyLabel(2026.5)).toThrow(RangeError);
  });
});

describe('fyBounds', () => {
  it('spans 1 July to 30 June of the following year', () => {
    expect(fyBounds(2026)).toEqual({ start: '2026-07-01', end: '2027-06-30' });
  });

  it('produces bounds that map back to the same financial year', () => {
    for (const fy of [2024, 2025, 2026, 2027, 2028]) {
      const { start, end } = fyBounds(fy);
      expect(fyStartYear(start)).toBe(fy);
      expect(fyStartYear(end)).toBe(fy);
    }
  });

  it('leaves no gap between consecutive financial years', () => {
    expect(fyBounds(2026).end).toBe('2027-06-30');
    expect(fyBounds(2027).start).toBe('2027-07-01');
  });
});

describe('isInFy', () => {
  it('includes both boundary days', () => {
    expect(isInFy('2026-07-01', 2026)).toBe(true);
    expect(isInFy('2027-06-30', 2026)).toBe(true);
  });

  it('excludes the days just outside', () => {
    expect(isInFy('2026-06-30', 2026)).toBe(false);
    expect(isInFy('2027-07-01', 2026)).toBe(false);
  });
});

describe('parseIsoDate', () => {
  it('splits a valid date into parts', () => {
    expect(parseIsoDate('2026-07-01')).toEqual({ year: 2026, month: 7, day: 1 });
  });

  it.each(['2026-7-1', '01/07/2026', '2026-07-01T00:00:00Z', '', 'yesterday'])(
    'rejects malformed input %p',
    (input) => {
      expect(() => parseIsoDate(input)).toThrow(RangeError);
    },
  );

  it('rejects an out-of-range month', () => {
    expect(() => parseIsoDate('2026-13-01')).toThrow(RangeError);
    expect(() => parseIsoDate('2026-00-01')).toThrow(RangeError);
  });

  it('rejects a day that does not exist in that month', () => {
    // `new Date('2026-02-30')` would silently roll over to 2 March.
    expect(() => parseIsoDate('2026-02-30')).toThrow(RangeError);
    expect(() => parseIsoDate('2026-04-31')).toThrow(RangeError);
    expect(() => parseIsoDate('2026-06-31')).toThrow(RangeError);
  });

  it('accepts 29 February only in a leap year', () => {
    expect(parseIsoDate('2028-02-29').day).toBe(29);
    expect(() => parseIsoDate('2026-02-29')).toThrow(RangeError);
  });
});

describe('isLeapYear', () => {
  it.each([
    [2024, true],
    [2026, false],
    [2028, true],
    [1900, false], // divisible by 100 but not 400
    [2000, true], // divisible by 400
  ])('%i → %p', (year, expected) => {
    expect(isLeapYear(year)).toBe(expected);
  });
});

describe('daysInMonth', () => {
  it('handles February in both leap and common years', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('handles 30- and 31-day months', () => {
    expect(daysInMonth(2026, 6)).toBe(30);
    expect(daysInMonth(2026, 7)).toBe(31);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('toIsoDate', () => {
  it('uses local calendar components, not UTC', () => {
    // 30 June 2026, 23:00 local. Formatting via UTC in an Australian timezone
    // would roll this to 1 July and file the receipt in the wrong tax year.
    const lateOnJune30 = new Date(2026, 5, 30, 23, 0, 0);
    expect(toIsoDate(lateOnJune30)).toBe('2026-06-30');
  });

  it('handles the first instant of a day', () => {
    expect(toIsoDate(new Date(2026, 6, 1, 0, 0, 0))).toBe('2026-07-01');
  });

  it('zero-pads month and day', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('rejects an invalid Date', () => {
    expect(() => toIsoDate(new Date('nonsense'))).toThrow(RangeError);
  });

  it('round-trips through parseIsoDate', () => {
    const iso = toIsoDate(new Date(2026, 6, 1));
    expect(parseIsoDate(iso)).toEqual({ year: 2026, month: 7, day: 1 });
  });
});

describe('currentFy', () => {
  it('reads the financial year from an injected clock', () => {
    expect(currentFy(new Date(2026, 6, 1))).toBe(2026); // 1 Jul 2026
    expect(currentFy(new Date(2026, 5, 30))).toBe(2025); // 30 Jun 2026
  });

  it('does not shift at either end of the day', () => {
    expect(currentFy(new Date(2026, 5, 30, 23, 59, 59))).toBe(2025);
    expect(currentFy(new Date(2026, 6, 1, 0, 0, 0))).toBe(2026);
  });

  it('defaults to the system clock', () => {
    expect(Number.isInteger(currentFy())).toBe(true);
  });
});
