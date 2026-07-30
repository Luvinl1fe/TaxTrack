/**
 * The receipt repository, executed against real SQLite.
 *
 * Covers what typechecking cannot: that the positional binds line up with the
 * columns, that `deleted_at IS NULL` filters what it claims to, and that
 * `totalsByCategory` produces the same number as `deductibleCents()`.
 */

import { migrate, seedCategories, setDatabaseForTests } from '@/db/database';
import type { SqliteDatabase } from '@/db/driver';
import { receiptRepository } from '@/db/receiptRepository';
import { createReceipt, type NewReceiptInput } from '@/domain/factories';
import { financialYearOptions, groupByCategory, totalClaimedCents } from '@/domain/receiptList';
import { substantiationStatus } from '@/domain/substantiation';
import { deductibleCents, type Receipt } from '@/domain/types';
import { createTestDatabase } from '../../../test-support/sqliteTestDatabase';

// Both are native modules that don't load in Node; neither is called here. The
// database is injected, and the repository's ids come from the fixtures. Babel
// hoists these above the imports above.
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'not-used-in-these-tests' }));

const FY = 2025;

let db: SqliteDatabase;

beforeEach(async () => {
  db = createTestDatabase();
  await migrate(db);
  await seedCategories(db);
  setDatabaseForTests(db);
});

afterEach(async () => {
  setDatabaseForTests(null);
  await db.closeAsync();
});

/** A receipt in FY 2025-26 with sensible defaults, overridable per test. */
function receipt(overrides: Partial<NewReceiptInput> & { id: string }): Receipt {
  return createReceipt({
    merchant: 'Officeworks',
    amountCents: 4995,
    purchaseDate: '2025-08-15',
    categoryId: 'stationery',
    now: '2025-08-15T02:30:00.000Z',
    ...overrides,
  });
}

async function saveAll(receipts: Receipt[]): Promise<void> {
  for (const record of receipts) await receiptRepository.save(record);
}

describe('save and get', () => {
  it('round-trips every field', async () => {
    // Every optional column populated: `fromReceipt` binds positionally, so a
    // column out of order writes a merchant into a notes field and typechecks.
    const original = receipt({
      id: 'r1',
      merchant: "Bunnings Warehouse — O'Connor",
      amountCents: 120000,
      gstCents: 10909,
      workUsePercent: 60,
      notes: 'Drill for site work\nSecond line',
      photoUri: 'file:///documents/receipts/r1.jpg',
      substantiationExemption: 'travel_allowance',
      categoryId: 'tools-equipment',
    });

    await receiptRepository.save(original);

    expect(await receiptRepository.get('r1')).toEqual(original);
  });

  it('round-trips a receipt with every optional field empty', async () => {
    const original = receipt({ id: 'r2' });

    await receiptRepository.save(original);

    const loaded = await receiptRepository.get('r2');
    expect(loaded).toEqual(original);
    // Not undefined, and not the empty string SQLite would happily accept.
    expect(loaded?.gstCents).toBeNull();
    expect(loaded?.notes).toBeNull();
    expect(loaded?.photoUri).toBeNull();
    expect(loaded?.substantiationExemption).toBeNull();
  });

  it('returns null for an id that does not exist', async () => {
    expect(await receiptRepository.get('nope')).toBeNull();
  });

  it('updates in place rather than inserting a second row', async () => {
    const original = receipt({ id: 'r3', merchant: 'Typo' });
    await receiptRepository.save(original);

    await receiptRepository.save({ ...original, merchant: 'Officeworks', amountCents: 5995 });

    const all = await receiptRepository.list(FY);
    expect(all).toHaveLength(1);
    expect(all[0].merchant).toBe('Officeworks');
    expect(all[0].amountCents).toBe(5995);
  });
});

describe('list', () => {
  it('returns only the financial year asked for', async () => {
    await saveAll([
      receipt({ id: 'this-year', purchaseDate: '2025-08-15' }),
      // 30 June is the last day of FY 2024-25, 1 July the first of 2025-26.
      receipt({ id: 'last-year', purchaseDate: '2025-06-30' }),
      receipt({ id: 'first-day', purchaseDate: '2025-07-01' }),
    ]);

    const ids = (await receiptRepository.list(FY)).map((r) => r.id);
    expect(ids.sort()).toEqual(['first-day', 'this-year']);
  });

  it('hides soft-deleted receipts by default', async () => {
    await saveAll([receipt({ id: 'kept' }), receipt({ id: 'binned' })]);
    await receiptRepository.softDelete('binned');

    expect((await receiptRepository.list(FY)).map((r) => r.id)).toEqual(['kept']);
  });

  it('includes soft-deleted receipts when asked', async () => {
    await saveAll([receipt({ id: 'kept' }), receipt({ id: 'binned' })]);
    await receiptRepository.softDelete('binned');

    const ids = (await receiptRepository.list(FY, { includeDeleted: true })).map((r) => r.id);
    expect(ids.sort()).toEqual(['binned', 'kept']);
  });

  it('filters by category', async () => {
    await saveAll([
      receipt({ id: 'stat', categoryId: 'stationery' }),
      receipt({ id: 'tool', categoryId: 'tools-equipment' }),
    ]);

    const found = await receiptRepository.list(FY, { categoryId: 'tools-equipment' });
    expect(found.map((r) => r.id)).toEqual(['tool']);
  });

  it('combines the category filter with the deleted filter', async () => {
    await saveAll([
      receipt({ id: 'kept', categoryId: 'tools-equipment' }),
      receipt({ id: 'binned', categoryId: 'tools-equipment' }),
    ]);
    await receiptRepository.softDelete('binned');

    const found = await receiptRepository.list(FY, { categoryId: 'tools-equipment' });
    expect(found.map((r) => r.id)).toEqual(['kept']);
  });

  it('orders newest purchase first, falling back to entry order', async () => {
    // Dates are stored as YYYY-MM-DD precisely so ORDER BY works on the text.
    await saveAll([
      receipt({ id: 'oct', purchaseDate: '2025-10-02' }),
      receipt({ id: 'aug', purchaseDate: '2025-08-15' }),
      receipt({ id: 'dec', purchaseDate: '2025-12-24' }),
      // Same purchase date as 'aug', entered later: the tiebreak puts it first.
      receipt({ id: 'aug-later', purchaseDate: '2025-08-15', now: '2025-09-01T04:00:00.000Z' }),
    ]);

    expect((await receiptRepository.list(FY)).map((r) => r.id)).toEqual([
      'dec',
      'oct',
      'aug-later',
      'aug',
    ]);
  });
});

describe('softDelete', () => {
  it('tombstones the row instead of removing it', async () => {
    await receiptRepository.save(receipt({ id: 'r1' }));

    await receiptRepository.softDelete('r1');

    // Still fetchable by id — a hard delete can't replicate, so the row has to
    // survive for the sync pass in milestone 8 to send the tombstone.
    const loaded = await receiptRepository.get('r1');
    expect(loaded).not.toBeNull();
    expect(loaded?.deletedAt).not.toBeNull();
  });

  it('marks the row pending so the delete can sync', async () => {
    const original = receipt({ id: 'r1' });
    await receiptRepository.save({ ...original, syncState: 'synced' });

    await receiptRepository.softDelete('r1');

    const loaded = await receiptRepository.get('r1');
    expect(loaded?.syncState).toBe('pending');
    // updated_at is what last-write-wins compares; a delete that didn't bump it
    // would lose to a stale edit from another device.
    expect(loaded?.updatedAt).not.toBe(original.updatedAt);
  });

  it('does nothing for an id that does not exist', async () => {
    await expect(receiptRepository.softDelete('nope')).resolves.toBeUndefined();
  });
});

describe('totalsByCategory', () => {
  /**
   * Hand-calculated fixtures — the milestone 5 done-when bar.
   *
   *   tools-equipment  $1,200.00 @ 60%  → 120000 * 0.60 = 72000
   *                    $89.99   @ 33%  → 8999 * 0.33 = 2969.67 → 2970
   *                                                      total 74970
   *   stationery       $49.95   @ 100% →                       4995
   *                    $49.95   @ 50%  → 2497.5 → 2498
   *                                                      total 7493
   *   phone-internet   $110.00  @ 45%  → 4950 exactly           4950
   */
  const fixtures = (): Receipt[] => [
    receipt({ id: 'drill', categoryId: 'tools-equipment', amountCents: 120000, workUsePercent: 60 }),
    receipt({ id: 'bits', categoryId: 'tools-equipment', amountCents: 8999, workUsePercent: 33 }),
    receipt({ id: 'paper', categoryId: 'stationery', amountCents: 4995, workUsePercent: 100 }),
    receipt({ id: 'pens', categoryId: 'stationery', amountCents: 4995, workUsePercent: 50 }),
    receipt({ id: 'phone', categoryId: 'phone-internet', amountCents: 11000, workUsePercent: 45 }),
  ];

  it('matches hand-calculated totals, largest first', async () => {
    await saveAll(fixtures());

    expect(await receiptRepository.totalsByCategory(FY)).toEqual([
      { categoryId: 'tools-equipment', totalCents: 74970, receiptCount: 2 },
      { categoryId: 'stationery', totalCents: 7493, receiptCount: 2 },
      { categoryId: 'phone-internet', totalCents: 4950, receiptCount: 1 },
    ]);
  });

  it('agrees with deductibleCents(), which is the number the receipt list shows', async () => {
    const receipts = fixtures();
    await saveAll(receipts);

    const totals = await receiptRepository.totalsByCategory(FY);

    // The gap this closes: apportionment happens in SQL here and in TypeScript
    // on the list screen. A few cents of disagreement is plausible enough that
    // nobody notices, in a figure going onto a tax return.
    for (const total of totals) {
      const expected = receipts
        .filter((r) => r.categoryId === total.categoryId)
        .reduce((sum, r) => sum + deductibleCents(r), 0);
      expect(total.totalCents).toBe(expected);
    }
  });

  it('sums to the same figure as the $300 substantiation test', async () => {
    const receipts = fixtures();
    await saveAll(receipts);

    const totals = await receiptRepository.totalsByCategory(FY);
    const sqlTotal = totals.reduce((sum, total) => sum + total.totalCents, 0);

    // Every fixture category counts toward the threshold, so the dashboard's
    // category totals and its $300 nudge must add up to the same cents.
    expect(sqlTotal).toBe(substantiationStatus(receipts, FY).totalCents);
  });

  it('returns whole cents, never a fraction', async () => {
    await saveAll(fixtures());

    for (const total of await receiptRepository.totalsByCategory(FY)) {
      expect(Number.isInteger(total.totalCents)).toBe(true);
    }
  });

  it('excludes soft-deleted receipts', async () => {
    await saveAll([
      receipt({ id: 'kept', amountCents: 10000, workUsePercent: 100 }),
      receipt({ id: 'binned', amountCents: 55555, workUsePercent: 100 }),
    ]);
    await receiptRepository.softDelete('binned');

    expect(await receiptRepository.totalsByCategory(FY)).toEqual([
      { categoryId: 'stationery', totalCents: 10000, receiptCount: 1 },
    ]);
  });

  it('excludes other financial years', async () => {
    await saveAll([
      receipt({ id: 'this-year', purchaseDate: '2025-08-15', amountCents: 10000 }),
      receipt({ id: 'last-year', purchaseDate: '2025-06-30', amountCents: 99999 }),
    ]);

    expect(await receiptRepository.totalsByCategory(FY)).toEqual([
      { categoryId: 'stationery', totalCents: 10000, receiptCount: 1 },
    ]);
  });

  it('returns an empty list for a year with no receipts', async () => {
    // The dashboard renders this on first launch, so it must not be null.
    expect(await receiptRepository.totalsByCategory(FY)).toEqual([]);
  });

  it('handles a 0% work-use receipt without dropping the row', async () => {
    await saveAll([receipt({ id: 'personal', amountCents: 4995, workUsePercent: 0 })]);

    // Counted, but contributes nothing — the user should still see the receipt
    // they entered rather than wondering where it went.
    expect(await receiptRepository.totalsByCategory(FY)).toEqual([
      { categoryId: 'stationery', totalCents: 0, receiptCount: 1 },
    ]);
  });
});

describe('financialYearsWithReceipts', () => {
  it('is empty on first launch', async () => {
    // The dashboard adds the current year itself; the query must not invent one.
    expect(await receiptRepository.financialYearsWithReceipts()).toEqual([]);
  });

  it('lists each year once, newest first', async () => {
    await saveAll([
      receipt({ id: 'a', purchaseDate: '2023-09-01' }),
      receipt({ id: 'b', purchaseDate: '2025-08-15' }),
      receipt({ id: 'c', purchaseDate: '2025-12-24' }),
      receipt({ id: 'd', purchaseDate: '2024-07-01' }),
    ]);

    expect(await receiptRepository.financialYearsWithReceipts()).toEqual([2025, 2024, 2023]);
  });

  it('surfaces a decade-old receipt so the year selector can reach it', async () => {
    // Found on device against the milestone 3/4 dev screen, which hardcoded
    // currentFy(): a receipt backdated to 2011 saved correctly but no screen
    // could ever display its year. The selector is data-derived precisely so any
    // year holding a receipt is reachable.
    await saveAll([
      receipt({ id: 'old', purchaseDate: '2011-05-20' }),
      receipt({ id: 'now', purchaseDate: '2025-08-15' }),
    ]);

    const years = await receiptRepository.financialYearsWithReceipts();

    // May 2011 falls in FY 2010-11, so the year is 2010 — not 2011.
    expect(years).toEqual([2025, 2010]);
    expect(financialYearOptions(years, 2026)).toEqual([2026, 2025, 2010]);
    expect((await receiptRepository.list(2010)).map((r) => r.id)).toEqual(['old']);
  });

  it('drops a year once its only receipt is deleted', async () => {
    await saveAll([
      receipt({ id: 'kept', purchaseDate: '2025-08-15' }),
      receipt({ id: 'binned', purchaseDate: '2023-09-01' }),
    ]);

    await receiptRepository.softDelete('binned');

    expect(await receiptRepository.financialYearsWithReceipts()).toEqual([2025]);
  });
});

describe('the dashboard and the receipt list agree', () => {
  it('groups and totals identically in SQL and in TypeScript', async () => {
    const receipts = [
      receipt({ id: 'a', categoryId: 'tools-equipment', amountCents: 120000, workUsePercent: 60 }),
      receipt({ id: 'b', categoryId: 'tools-equipment', amountCents: 8999, workUsePercent: 33 }),
      receipt({ id: 'c', categoryId: 'stationery', amountCents: 4995, workUsePercent: 50 }),
      receipt({ id: 'd', categoryId: 'phone-internet', amountCents: 11000, workUsePercent: 45 }),
    ];
    await saveAll(receipts);

    // The dashboard reads totalsByCategory (SQL); the receipt list groups the
    // rows in TypeScript. Same screen, same figures — they have to match in both
    // value and order or the app contradicts itself.
    const fromSql = await receiptRepository.totalsByCategory(FY);
    const fromTypeScript = groupByCategory(await receiptRepository.list(FY));

    expect(fromTypeScript.map((group) => group.categoryId)).toEqual(
      fromSql.map((total) => total.categoryId),
    );
    expect(fromTypeScript.map((group) => group.totalCents)).toEqual(
      fromSql.map((total) => total.totalCents),
    );
    expect(fromTypeScript.map((group) => group.receipts.length)).toEqual(
      fromSql.map((total) => total.receiptCount),
    );
  });

  it('reports the same total claimed as the sum of the SQL categories', async () => {
    await saveAll([
      receipt({ id: 'a', categoryId: 'tools-equipment', amountCents: 8999, workUsePercent: 33 }),
      receipt({ id: 'b', categoryId: 'stationery', amountCents: 4995, workUsePercent: 50 }),
    ]);

    const fromSql = (await receiptRepository.totalsByCategory(FY)).reduce(
      (sum, total) => sum + total.totalCents,
      0,
    );

    expect(totalClaimedCents(await receiptRepository.list(FY))).toBe(fromSql);
  });
});

describe('SQL and TypeScript rounding agree', () => {
  // SQLite's ROUND() rounds half away from zero; Math.round() rounds half up.
  // They agree only because amounts are non-negative. This sweep is what makes
  // that reasoning something other than a comment.
  const percentages = Array.from({ length: 101 }, (_, index) => index);

  it.each([1, 3, 7, 99, 4995, 8999, 120000, 999999])(
    'for every work-use percentage of %i cents',
    async (amountCents) => {
      const receipts = percentages.map((percent) =>
        receipt({
          id: `p${percent}`,
          amountCents,
          workUsePercent: percent,
          // One category per amount so the SQL total covers all 101 rows.
          categoryId: 'stationery',
        }),
      );
      await saveAll(receipts);

      const [total] = await receiptRepository.totalsByCategory(FY);
      const expected = receipts.reduce((sum, r) => sum + deductibleCents(r), 0);

      expect(total.totalCents).toBe(expected);
      expect(total.receiptCount).toBe(percentages.length);
    },
  );
});
