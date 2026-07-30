import {
  MAX_TRIP_KILOMETRES,
  PURPOSE_MAX_LENGTH,
  VEHICLE_LABEL_MAX_LENGTH,
  emptyTripForm,
  parseKilometres,
  similarVehicleLabel,
  tripDateWarning,
  validateTripForm,
  type TripFormValues,
} from '@/domain/tripForm';

const valid: TripFormValues = {
  date: '2026-08-15',
  kilometres: '42.5',
  purpose: 'Site visit — Fremantle',
  vehicleLabel: 'Hilux',
};

describe('parseKilometres', () => {
  it.each([
    ['12', 12],
    ['12.5', 12.5],
    ['0.5', 0.5],
    ['12.25', 12.25],
    ['1234', 1234],
    [' 42 ', 42],
    ['42km', 42],
    ['42 km', 42],
    ['42KM', 42],
  ])('parses %p as %p', (input, expected) => {
    expect(parseKilometres(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'abc',
    '-5',
    '0',
    '0.0',
    '12.345',
    '1 2',
    '12,5',
    '1e3',
    '.5',
    '12.',
    '123456',
  ])('rejects %p', (input) => {
    expect(parseKilometres(input)).toBeNull();
  });

  it('rejects zero, since a trip of no distance is not a trip', () => {
    expect(parseKilometres('0')).toBeNull();
  });
});

describe('validateTripForm', () => {
  it('accepts a complete trip', () => {
    const result = validateTripForm(valid);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({
      date: '2026-08-15',
      kilometres: 42.5,
      purpose: 'Site visit — Fremantle',
      vehicleLabel: 'Hilux',
    });
  });

  it('trims the purpose and the label', () => {
    const result = validateTripForm({ ...valid, purpose: '  Client visit  ', vehicleLabel: ' Ute ' });

    expect(result.ok && result.value.purpose).toBe('Client visit');
    expect(result.ok && result.value.vehicleLabel).toBe('Ute');
  });

  it('requires a purpose, unlike a receipt note', () => {
    // The ATO expects a work-related reason per trip.
    const result = validateTripForm({ ...valid, purpose: '   ' });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.purpose).toMatch(/what the trip was for/);
  });

  it('requires a vehicle label, and says why', () => {
    const result = validateTripForm({ ...valid, vehicleLabel: '' });

    expect(!result.ok && result.errors.vehicleLabel).toMatch(/5,000 km cap/);
  });

  it('rejects an implausible single trip', () => {
    // 1500 typed for 150.0 moves the claim by over a thousand dollars, so this
    // is an error rather than a warning.
    const result = validateTripForm({ ...valid, kilometres: String(MAX_TRIP_KILOMETRES + 1) });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.kilometres).toMatch(/decimal point/);
  });

  it('accepts a long but possible drive', () => {
    expect(validateTripForm({ ...valid, kilometres: String(MAX_TRIP_KILOMETRES) }).ok).toBe(true);
  });

  it('rejects an over-long purpose and label', () => {
    const result = validateTripForm({
      ...valid,
      purpose: 'x'.repeat(PURPOSE_MAX_LENGTH + 1),
      vehicleLabel: 'y'.repeat(VEHICLE_LABEL_MAX_LENGTH + 1),
    });

    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(['purpose', 'vehicleLabel']);
  });

  it('reports every problem at once', () => {
    const result = validateTripForm({
      date: 'not-a-date',
      kilometres: 'abc',
      purpose: '',
      vehicleLabel: '',
    });

    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      'date',
      'kilometres',
      'purpose',
      'vehicleLabel',
    ]);
  });
});

describe('emptyTripForm', () => {
  it('starts blank apart from the date', () => {
    expect(emptyTripForm('2026-08-15')).toEqual({
      date: '2026-08-15',
      kilometres: '',
      purpose: '',
      vehicleLabel: '',
    });
  });

  it('can prefill the car, since the next trip is usually the same one', () => {
    expect(emptyTripForm('2026-08-15', 'Hilux').vehicleLabel).toBe('Hilux');
  });
});

describe('similarVehicleLabel', () => {
  const existing = ['Hilux', 'Corolla wagon'];

  it('spots a case-only difference', () => {
    // The bug this prevents: two labels, two 5,000 km caps, an overstated claim.
    expect(similarVehicleLabel('hilux', existing)).toBe('Hilux');
    expect(similarVehicleLabel('HILUX', existing)).toBe('Hilux');
  });

  it('spots a spacing-only difference', () => {
    expect(similarVehicleLabel('Corolla  wagon', existing)).toBe('Corolla wagon');
  });

  it('ignores surrounding whitespace', () => {
    expect(similarVehicleLabel('  hilux  ', existing)).toBe('Hilux');
  });

  it('says nothing when the label already matches exactly', () => {
    expect(similarVehicleLabel('Hilux', existing)).toBeNull();
  });

  it('says nothing for a genuinely new car', () => {
    expect(similarVehicleLabel('Van', existing)).toBeNull();
  });

  it('says nothing for an empty label', () => {
    expect(similarVehicleLabel('', existing)).toBeNull();
    expect(similarVehicleLabel('   ', existing)).toBeNull();
  });

  it('does not fire on a similar but distinct name', () => {
    // Two genuinely different cars may have close names; only case and spacing
    // are treated as the same label.
    expect(similarVehicleLabel('Hilux 2', existing)).toBeNull();
  });
});

describe('tripDateWarning', () => {
  const now = new Date('2026-07-30T02:00:00.000Z');

  it('says nothing about this year or last', () => {
    expect(tripDateWarning('2026-07-15', now)).toBeNull();
    expect(tripDateWarning('2026-05-20', now)).toBeNull();
  });

  it('warns about an old date without asserting a mistake', () => {
    const warning = tripDateWarning('2011-05-20', now);

    expect(warning).toContain('16 financial years ago');
    expect(warning).toContain('Fine if you meant it');
  });

  it('warns about a future date', () => {
    expect(tripDateWarning('2027-09-01', now)).toContain('in the future');
  });

  it('stays quiet for an unparseable date, which validation reports', () => {
    expect(tripDateWarning('nonsense', now)).toBeNull();
  });
});
