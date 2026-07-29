import {
  exclusionReason,
  substantiationMessage,
  substantiationStatus,
} from '@/domain/substantiation';
import type { Receipt, SubstantiationExemption } from '@/domain/types';

const FY = 2026;

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: 'r1',
    merchant: 'Officeworks',
    amountCents: 10_000,
    gstCents: null,
    purchaseDate: '2026-08-01',
    financialYear: FY,
    categoryId: 'stationery',
    workUsePercent: 100,
    notes: null,
    photoUri: null,
    substantiationExemption: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    deletedAt: null,
    serverId: null,
    syncState: 'pending',
    ...overrides,
  };
}

describe('exclusionReason', () => {
  it('counts an ordinary work expense', () => {
    expect(exclusionReason(receipt())).toBeNull();
  });

  it('excludes car expenses at the category level', () => {
    expect(exclusionReason(receipt({ categoryId: 'car' }))).toBe('category_out_of_scope');
  });

  it('excludes non-work categories', () => {
    expect(exclusionReason(receipt({ categoryId: 'gifts-donations' }))).toBe(
      'category_out_of_scope',
    );
    expect(exclusionReason(receipt({ categoryId: 'tax-affairs' }))).toBe('category_out_of_scope');
  });

  it('includes clothing and self-education', () => {
    // s 900-35 covers work expenses generally, not just D5.
    expect(exclusionReason(receipt({ categoryId: 'clothing' }))).toBeNull();
    expect(exclusionReason(receipt({ categoryId: 'self-education' }))).toBeNull();
  });

  it('includes ordinary travel not covered by an allowance', () => {
    expect(exclusionReason(receipt({ categoryId: 'travel' }))).toBeNull();
  });

  it.each<SubstantiationExemption>(['travel_allowance', 'meal_allowance', 'award_transport'])(
    'excludes a receipt exempted as %s',
    (exemption) => {
      const r = receipt({ categoryId: 'travel', substantiationExemption: exemption });
      expect(exclusionReason(r)).toBe(exemption);
    },
  );

  it('excludes soft-deleted receipts', () => {
    expect(exclusionReason(receipt({ deletedAt: '2026-09-01T00:00:00.000Z' }))).toBe('deleted');
  });

  it('excludes receipts whose category no longer exists', () => {
    expect(exclusionReason(receipt({ categoryId: 'gone' }))).toBe('unknown_category');
  });
});

describe('substantiationStatus', () => {
  it('sums in-scope receipts', () => {
    const status = substantiationStatus([receipt({ amountCents: 5_000 }), receipt({ id: 'r2', amountCents: 7_500 })], FY);
    expect(status.totalCents).toBe(12_500);
  });

  it('applies work-use percentage', () => {
    const status = substantiationStatus([receipt({ amountCents: 10_000, workUsePercent: 50 })], FY);
    expect(status.totalCents).toBe(5_000);
  });

  it('does not cross at exactly $300', () => {
    // The rule is "$300 or less" — 30,000 cents is inside the exception.
    const status = substantiationStatus([receipt({ amountCents: 30_000 })], FY);
    expect(status.crossed).toBe(false);
    expect(status.remainingCents).toBe(0);
  });

  it('crosses one cent over $300', () => {
    const status = substantiationStatus([receipt({ amountCents: 30_001 })], FY);
    expect(status.crossed).toBe(true);
  });

  it('reports how far short of the threshold the total is', () => {
    const status = substantiationStatus([receipt({ amountCents: 12_000 })], FY);
    expect(status.remainingCents).toBe(18_000);
  });

  it('reports zero remaining once crossed', () => {
    const status = substantiationStatus([receipt({ amountCents: 50_000 })], FY);
    expect(status.remainingCents).toBe(0);
  });

  it('keeps excluded receipts out of the total but records them', () => {
    const status = substantiationStatus(
      [
        receipt({ id: 'in', amountCents: 10_000 }),
        receipt({ id: 'car', categoryId: 'car', amountCents: 90_000 }),
        receipt({ id: 'allowance', categoryId: 'travel', amountCents: 90_000, substantiationExemption: 'travel_allowance' }),
      ],
      FY,
    );

    expect(status.totalCents).toBe(10_000);
    expect(status.crossed).toBe(false);
    expect(status.excluded).toEqual([
      { receiptId: 'car', reason: 'category_out_of_scope' },
      { receiptId: 'allowance', reason: 'travel_allowance' },
    ]);
  });

  it('handles an empty year', () => {
    const status = substantiationStatus([], FY);
    expect(status.totalCents).toBe(0);
    expect(status.crossed).toBe(false);
    expect(status.remainingCents).toBe(30_000);
  });

  it('throws rather than assuming $300 for a year with no rates', () => {
    expect(() => substantiationStatus([], 1999)).toThrow(RangeError);
  });

  it('reports the threshold it applied', () => {
    expect(substantiationStatus([], FY).thresholdCents).toBe(30_000);
  });
});

describe('substantiationMessage', () => {
  it('makes clear that crossing requires evidence for everything', () => {
    const status = substantiationStatus([receipt({ amountCents: 40_000 })], FY);
    const message = substantiationMessage(status);
    expect(message).toContain('not just the amount above');
  });

  it('never implies $300 can be claimed without receipts', () => {
    // The misreading this feature exists to prevent.
    for (const amount of [0, 10_000, 30_000, 40_000]) {
      const message = substantiationMessage(substantiationStatus([receipt({ amountCents: amount })], FY));
      expect(message).not.toMatch(/claim .* without receipts/i);
    }
  });

  it('counts down toward the threshold before it is crossed', () => {
    const status = substantiationStatus([receipt({ amountCents: 25_000 })], FY);
    expect(substantiationMessage(status)).toContain('$50.00');
  });
});
