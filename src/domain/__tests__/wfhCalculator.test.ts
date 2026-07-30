import { createWfhLog } from '@/domain/factories';
import type { CategoryTotal, WfhLog } from '@/domain/types';
import {
  WFH_FIXED_RATE_COVERS,
  calculateWfhClaim,
  conflictingCategoryIds,
  conflictingCents,
  hoursLoggedOn,
} from '@/domain/wfhCalculator';

/** FY 2026-27, whose rate is provisional at 70c. */
const FY = 2026;
/** FY 2025-26, whose 70c is published. */
const FY_PUBLISHED = 2025;

function log(id: string, hours: number, date = '2026-08-15'): WfhLog {
  return createWfhLog({ id, date, hours, now: '2026-08-15T02:30:00.000Z' });
}

describe('calculateWfhClaim', () => {
  it('is zero for no logs, but still reports the rate', () => {
    const result = calculateWfhClaim([], FY);

    expect(result?.totalHours).toBe(0);
    expect(result?.claimableCents).toBe(0);
    // So the screen can explain the method before any hours exist.
    expect(result?.centsPerHour).toBe(70);
  });

  it('multiplies hours by the rate', () => {
    // 10 hours × 70c = 700c = $7.00. Spread over days rather than one long log,
    // because createWfhLog rightly refuses more than 24 hours in a day.
    expect(calculateWfhClaim([log('a', 10)], FY)?.claimableCents).toBe(700);

    // 100 hours across ten days = $70.00
    const tenDays = Array.from({ length: 10 }, (_, index) =>
      log(`d${index}`, 10, `2026-08-${String(index + 10).padStart(2, '0')}`),
    );
    expect(calculateWfhClaim(tenDays, FY)?.claimableCents).toBe(7_000);
  });

  it('sums logs across days', () => {
    const result = calculateWfhClaim(
      [log('a', 7.5, '2026-08-15'), log('b', 8, '2026-08-16'), log('c', 4.25, '2026-08-17')],
      FY,
    );

    expect(result?.totalHours).toBeCloseTo(19.75, 10);
    expect(result?.dayCount).toBe(3);
    expect(result?.logCount).toBe(3);
    // 19.75 × 70 = 1,382.5c → 1,383 (half up)
    expect(result?.claimableCents).toBe(1_383);
  });

  it('rounds once at the end, not per log', () => {
    // Three logs of 0.5h: 1.5 × 70 = 105c exactly. Per-log rounding would give
    // 35 + 35 + 35 = 105 here, so use a case where it differs:
    // three logs of 0.51h = 1.53h × 70 = 107.1 → 107. Per log: 36+36+36 = 108.
    const result = calculateWfhClaim([log('a', 0.51), log('b', 0.51), log('c', 0.51)], FY);

    expect(result?.claimableCents).toBe(107);
  });

  it('survives hours that are not exactly representable in binary', () => {
    // 7.6 + 2.4 is 10.000000000000002 in IEEE 754. The single final rounding is
    // what stops that reaching the cents figure.
    const result = calculateWfhClaim([log('a', 7.6, '2026-08-15'), log('b', 2.4, '2026-08-16')], FY);

    expect(result?.claimableCents).toBe(700);
  });

  it('counts days rather than logs when a day is split', () => {
    const result = calculateWfhClaim(
      [log('a', 4, '2026-08-15'), log('b', 3.5, '2026-08-15')],
      FY,
    );

    expect(result?.logCount).toBe(2);
    expect(result?.dayCount).toBe(1);
    expect(result?.totalHours).toBe(7.5);
  });

  it('returns whole cents', () => {
    const result = calculateWfhClaim([log('a', 3.33)], FY);

    expect(Number.isInteger(result?.claimableCents)).toBe(true);
  });

  it('flags the 2026-27 rate as provisional', () => {
    // The ATO hasn't published it; 70c is standing in.
    expect(calculateWfhClaim([log('a', 10)], FY)?.provisional).toBe(true);
  });

  it('does not flag a published rate as provisional', () => {
    const result = calculateWfhClaim([log('a', 10, '2025-08-15')], FY_PUBLISHED);

    expect(result?.centsPerHour).toBe(70);
    expect(result?.provisional).toBe(false);
  });

  it('reads the rate from config rather than embedding it', () => {
    // Both years happen to be 70c, so assert the source rather than the value:
    // a year absent from the table must produce nothing at all.
    expect(calculateWfhClaim([log('a', 10, '1999-08-15')], 1999)).toBeNull();
  });
});

describe('double-claim detection', () => {
  const totals = (entries: [string, number][]): CategoryTotal[] =>
    entries.map(([categoryId, totalCents]) => ({ categoryId, totalCents, receiptCount: 1 }));

  it('knows the fixed rate covers phone, internet and stationery', () => {
    expect(WFH_FIXED_RATE_COVERS).toContain('phone-internet');
    expect(WFH_FIXED_RATE_COVERS).toContain('stationery');
  });

  it('flags receipts the fixed rate already pays for', () => {
    // The over-claim this exists to catch: 70c an hour already covers the phone
    // bill, so claiming the bill as a receipt too is claiming it twice.
    const found = conflictingCategoryIds(totals([['phone-internet', 5_000]]));

    expect(found).toEqual(['phone-internet']);
  });

  it('flags several at once', () => {
    const found = conflictingCategoryIds(
      totals([
        ['phone-internet', 5_000],
        ['stationery', 2_000],
        ['tools-equipment', 90_000],
      ]),
    );

    expect(found.sort()).toEqual(['phone-internet', 'stationery']);
  });

  it('leaves depreciating assets alone, which are still claimable', () => {
    // A desk, chair or computer is not covered by the rate and may be claimed
    // separately. Warning about it would be wrong.
    expect(conflictingCategoryIds(totals([['tools-equipment', 120_000]]))).toEqual([]);
  });

  it('ignores a category with nothing in it', () => {
    expect(conflictingCategoryIds(totals([['phone-internet', 0]]))).toEqual([]);
  });

  it('says nothing when there are no receipts at all', () => {
    expect(conflictingCategoryIds([])).toEqual([]);
    expect(conflictingCents([])).toBe(0);
  });

  it('totals the clashing receipts so the warning can name a figure', () => {
    const amount = conflictingCents(
      totals([
        ['phone-internet', 5_000],
        ['stationery', 2_500],
        ['tools-equipment', 90_000],
      ]),
    );

    expect(amount).toBe(7_500);
  });
});

describe('hoursLoggedOn', () => {
  const logs = [
    log('a', 4, '2026-08-15'),
    log('b', 3.5, '2026-08-15'),
    log('c', 8, '2026-08-16'),
  ];

  it('adds up a day', () => {
    expect(hoursLoggedOn(logs, '2026-08-15')).toBe(7.5);
  });

  it('is zero for a day with nothing logged', () => {
    expect(hoursLoggedOn(logs, '2026-08-20')).toBe(0);
  });

  it('excludes the log being edited, so it is not its own duplicate', () => {
    expect(hoursLoggedOn(logs, '2026-08-15', 'a')).toBe(3.5);
  });

  it('excludes nothing when the id is not on that day', () => {
    expect(hoursLoggedOn(logs, '2026-08-15', 'c')).toBe(7.5);
  });
});
