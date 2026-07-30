import {
  LONG_DAY_HOURS,
  MAX_HOURS_PER_LOG,
  WFH_NOTES_MAX_LENGTH,
  emptyWfhForm,
  formatHours,
  hoursWarning,
  parseHours,
  validateWfhForm,
  wfhDateWarning,
  type WfhFormValues,
} from '@/domain/wfhForm';

const valid: WfhFormValues = { date: '2026-08-15', hours: '7.5', notes: '' };

describe('parseHours', () => {
  it.each([
    ['8', 8],
    ['7.5', 7.5],
    ['7.75', 7.75],
    ['0.5', 0.5],
    [' 8 ', 8],
    ['8h', 8],
    ['8hr', 8],
    ['7.5 hrs', 7.5],
  ])('parses %p as %p', (input, expected) => {
    expect(parseHours(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '-4', '0', '0.0', '7.555', '7 5', '7,5', '.5', '8.', '100'])(
    'rejects %p',
    (input) => {
      expect(parseHours(input)).toBeNull();
    },
  );

  it('rejects a colon rather than guessing at minutes', () => {
    // "7:30" as 7.3 hours would be wrong by 18 minutes a day, which compounds
    // over a year into a materially wrong claim.
    expect(parseHours('7:30')).toBeNull();
  });
});

describe('validateWfhForm', () => {
  it('accepts a complete log', () => {
    const result = validateWfhForm(valid);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({ date: '2026-08-15', hours: 7.5, notes: null });
  });

  it('keeps notes when given, trimmed', () => {
    const result = validateWfhForm({ ...valid, notes: '  Spare room  ' });

    expect(result.ok && result.value.notes).toBe('Spare room');
  });

  it('rejects more hours than a day has', () => {
    const result = validateWfhForm({ ...valid, hours: String(MAX_HOURS_PER_LOG + 1) });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.hours).toContain('24 hours');
  });

  it('accepts exactly a full day', () => {
    expect(validateWfhForm({ ...valid, hours: String(MAX_HOURS_PER_LOG) }).ok).toBe(true);
  });

  it('rejects over-long notes', () => {
    const result = validateWfhForm({ ...valid, notes: 'x'.repeat(WFH_NOTES_MAX_LENGTH + 1) });

    expect(!result.ok && result.errors.notes).toBeDefined();
  });

  it('reports every problem at once', () => {
    const result = validateWfhForm({ date: 'nope', hours: 'abc', notes: '' });

    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(['date', 'hours']);
  });
});

describe('emptyWfhForm', () => {
  it('starts blank apart from the date', () => {
    expect(emptyWfhForm('2026-08-15')).toEqual({ date: '2026-08-15', hours: '', notes: '' });
  });
});

describe('hoursWarning', () => {
  it('says nothing for an ordinary day', () => {
    expect(hoursWarning('7.5', 0)).toBeNull();
  });

  it('warns that an entry adds to the day rather than replacing it', () => {
    // The likeliest way a yearly total silently doubles.
    const warning = hoursWarning('4', 3.5);

    expect(warning).toContain('3.5 hours logged');
    expect(warning).toContain('adds to it');
    expect(warning).toContain('7.5 hours total');
  });

  it('warns harder when the combined day exceeds 24 hours', () => {
    const warning = hoursWarning('10', 20);

    expect(warning).toContain('more than a day');
  });

  it('warns about a suspiciously long day', () => {
    const warning = hoursWarning(String(LONG_DAY_HOURS + 1), 0);

    expect(warning).toContain('long day');
    expect(warning).toContain('check the decimal point');
  });

  it('does not warn at exactly the long-day threshold', () => {
    expect(hoursWarning(String(LONG_DAY_HOURS), 0)).toBeNull();
  });

  it('prefers the duplicate-day warning over the long-day one', () => {
    // Both could apply; the day total is the more actionable fact.
    expect(hoursWarning('20', 2)).toContain('already has');
  });

  it('says nothing while the field is unparseable', () => {
    // Validation reports that; two messages at once would be noise.
    expect(hoursWarning('', 5)).toBeNull();
    expect(hoursWarning('abc', 5)).toBeNull();
  });

  it('avoids float noise in the combined figure', () => {
    // 7.6 + 2.4 is 10.000000000000002 in IEEE 754.
    expect(hoursWarning('2.4', 7.6)).toContain('10 hours total');
  });
});

describe('formatHours', () => {
  it.each([
    [1, '1 hour'],
    [7.5, '7.5 hours'],
    [8, '8 hours'],
    [0.5, '0.5 hours'],
    [10.000000000000002, '10 hours'],
    [1234.5, '1,234.5 hours'],
  ])('formats %p as %p', (hours, expected) => {
    expect(formatHours(hours)).toBe(expected);
  });
});

describe('wfhDateWarning', () => {
  const now = new Date('2026-07-30T02:00:00.000Z');

  it('says nothing about this year or last', () => {
    expect(wfhDateWarning('2026-07-15', now)).toBeNull();
    expect(wfhDateWarning('2026-05-20', now)).toBeNull();
  });

  it('warns about an old date without asserting a mistake', () => {
    expect(wfhDateWarning('2011-05-20', now)).toContain('Fine if you meant it');
  });

  it('warns about a future date', () => {
    expect(wfhDateWarning('2027-09-01', now)).toContain('in the future');
  });

  it('stays quiet for an unparseable date', () => {
    expect(wfhDateWarning('nonsense', now)).toBeNull();
  });
});
