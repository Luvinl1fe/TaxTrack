import {
  ATO_RATES,
  getRate,
  rateUnavailableMessage,
  ratesForFy,
  supportedFyRange,
  type NullableRate,
} from '@/config/atoRates';

const ALL_FYS = Object.keys(ATO_RATES).map(Number);

describe('ATO_RATES', () => {
  it('covers the financial year the app is being built for', () => {
    expect(ATO_RATES[2026]).toBeDefined();
  });

  it('caps the cents-per-km method at 5,000 km per car in every year', () => {
    for (const fy of ALL_FYS) {
      expect(ATO_RATES[fy].kmCapPerCar).toBe(5_000);
    }
  });

  it('holds both $300 thresholds in integer cents', () => {
    for (const fy of ALL_FYS) {
      expect(ATO_RATES[fy].substantiationThresholdCents).toBe(30_000);
      expect(ATO_RATES[fy].immediateWriteOffThresholdCents).toBe(30_000);
    }
  });

  it('keeps the two $300 rules as separate fields', () => {
    // Same figure, unrelated rules: one is an aggregate evidence test, the
    // other a per-asset depreciation test. Collapsing them into one field is
    // how a calculator ends up applying the wrong rule.
    const rates = ATO_RATES[2026];
    expect(Object.keys(rates)).toContain('substantiationThresholdCents');
    expect(Object.keys(rates)).toContain('immediateWriteOffThresholdCents');
  });

  it('stores every rate as whole cents, never dollars', () => {
    // 0.7 instead of 70 would understate a WFH claim by a factor of 100.
    for (const fy of ALL_FYS) {
      const { wfhCentsPerHour, centsPerKm, substantiationThresholdCents } = ATO_RATES[fy];
      for (const value of [wfhCentsPerHour, centsPerKm]) {
        if (value !== null) {
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThan(1);
        }
      }
      expect(Number.isInteger(substantiationThresholdCents)).toBe(true);
    }
  });

  it('has no gaps between the years it covers', () => {
    const sorted = [...ALL_FYS].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i] - sorted[i - 1]).toBe(1);
    }
  });
});

describe('published rate values', () => {
  it('uses 88c/km for 2024–25 and 2025–26', () => {
    expect(ATO_RATES[2024].centsPerKm).toBe(88);
    expect(ATO_RATES[2025].centsPerKm).toBe(88);
  });

  it('uses 91c/km for 2026–27', () => {
    expect(ATO_RATES[2026].centsPerKm).toBe(91);
  });

  it('uses the 70c WFH fixed rate for 2024–25 and 2025–26', () => {
    expect(ATO_RATES[2024].wfhCentsPerHour).toBe(70);
    expect(ATO_RATES[2025].wfhCentsPerHour).toBe(70);
  });

  it('leaves the 2026–27 WFH rate unset until a human verifies it', () => {
    // Failing here means someone filled the rate in. That's the goal — update
    // this test alongside it, and only once it's confirmed against ato.gov.au.
    expect(ATO_RATES[2026].wfhCentsPerHour).toBeNull();
  });

  it('caps a full 5,000 km claim at $4,550 for 2026–27', () => {
    const { centsPerKm, kmCapPerCar } = ATO_RATES[2026];
    expect(centsPerKm! * kmCapPerCar).toBe(455_000); // cents
  });
});

describe('ratesForFy', () => {
  it('returns the rates for a covered year', () => {
    expect(ratesForFy(2026)).toBe(ATO_RATES[2026]);
  });

  it('returns null for a year outside the table', () => {
    expect(ratesForFy(1999)).toBeNull();
    expect(ratesForFy(2099)).toBeNull();
  });
});

describe('getRate', () => {
  it('reads a published rate', () => {
    expect(getRate(2026, 'centsPerKm')).toBe(91);
  });

  it('returns null for an unpublished rate rather than the prior year value', () => {
    // The whole point: silently falling back to 70c would produce a plausible
    // but unverified number on someone's tax return.
    expect(getRate(2026, 'wfhCentsPerHour')).toBeNull();
    expect(getRate(2025, 'wfhCentsPerHour')).toBe(70);
  });

  it('returns null for an unknown financial year', () => {
    expect(getRate(1999, 'centsPerKm')).toBeNull();
  });
});

describe('rateUnavailableMessage', () => {
  it('names the rate and the financial year', () => {
    const message = rateUnavailableMessage(2026, 'wfhCentsPerHour');
    expect(message).toContain('2026–27');
    expect(message).toContain('working-from-home fixed rate');
  });

  it.each<NullableRate>(['wfhCentsPerHour', 'centsPerKm'])(
    'produces a message for %s',
    (rate) => {
      expect(rateUnavailableMessage(2026, rate)).toMatch(/isn't available yet/);
    },
  );
});

describe('supportedFyRange', () => {
  it('reports the bounds of the table', () => {
    expect(supportedFyRange()).toEqual({
      earliest: Math.min(...ALL_FYS),
      latest: Math.max(...ALL_FYS),
    });
  });
});
