import {
  categoryName,
  financialYearOptions,
  groupByCategory,
  searchReceipts,
  totalClaimedCents,
} from '@/domain/receiptList';
import { createReceipt, type NewReceiptInput } from '@/domain/factories';
import type { Receipt } from '@/domain/types';

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

describe('categoryName', () => {
  it('resolves a known category', () => {
    expect(categoryName('stationery')).toBe('Stationery & consumables');
  });

  it('falls back to the id for a category a later build dropped', () => {
    // Better a bare id than an empty row the user can't identify.
    expect(categoryName('retired-category')).toBe('retired-category');
  });
});

describe('groupByCategory', () => {
  it('returns nothing for no receipts', () => {
    expect(groupByCategory([])).toEqual([]);
  });

  it('groups receipts under their category', () => {
    const groups = groupByCategory([
      receipt({ id: 'a', categoryId: 'stationery' }),
      receipt({ id: 'b', categoryId: 'tools-equipment' }),
      receipt({ id: 'c', categoryId: 'stationery' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.receipts.length).sort()).toEqual([1, 2]);
  });

  it('orders the largest total first, matching the dashboard', () => {
    const groups = groupByCategory([
      receipt({ id: 'small', categoryId: 'stationery', amountCents: 1000 }),
      receipt({ id: 'big', categoryId: 'tools-equipment', amountCents: 99000 }),
      receipt({ id: 'middle', categoryId: 'phone-internet', amountCents: 5000 }),
    ]);

    expect(groups.map((group) => group.categoryId)).toEqual([
      'tools-equipment',
      'phone-internet',
      'stationery',
    ]);
  });

  it('breaks ties on name so the order does not shuffle between renders', () => {
    const groups = groupByCategory([
      receipt({ id: 'a', categoryId: 'tools-equipment', amountCents: 5000 }),
      receipt({ id: 'b', categoryId: 'stationery', amountCents: 5000 }),
    ]);

    // Alphabetical by name, stated through categoryName so renaming a category
    // in the config doesn't break a test that isn't about names.
    expect(groups.map((group) => group.categoryName)).toEqual(
      [categoryName('stationery'), categoryName('tools-equipment')].sort((a, b) =>
        a.localeCompare(b),
      ),
    );
  });

  it('apportions work-use per receipt, then sums', () => {
    // 8999 @ 33% rounds to 2970, then adds. Rounding the sum instead would
    // disagree with totalsByCategory's SQL by a cent or two.
    const groups = groupByCategory([
      receipt({ id: 'a', amountCents: 8999, workUsePercent: 33 }),
      receipt({ id: 'b', amountCents: 4995, workUsePercent: 50 }),
    ]);

    expect(groups[0].totalCents).toBe(2970 + 2498);
  });

  it('keeps a receipt whose category the build no longer knows', () => {
    const groups = groupByCategory([receipt({ id: 'a', categoryId: 'retired-category' })]);

    expect(groups[0].categoryName).toBe('retired-category');
    expect(groups[0].receipts).toHaveLength(1);
  });
});

describe('totalClaimedCents', () => {
  it('is zero for no receipts', () => {
    expect(totalClaimedCents([])).toBe(0);
  });

  it('sums the deductible portions, not the full amounts', () => {
    expect(
      totalClaimedCents([
        receipt({ id: 'a', amountCents: 10000, workUsePercent: 50 }),
        receipt({ id: 'b', amountCents: 10000, workUsePercent: 100 }),
      ]),
    ).toBe(15000);
  });

  it('agrees with the sum of the category groups', () => {
    const receipts = [
      receipt({ id: 'a', categoryId: 'stationery', amountCents: 8999, workUsePercent: 33 }),
      receipt({ id: 'b', categoryId: 'tools-equipment', amountCents: 4995, workUsePercent: 50 }),
      receipt({ id: 'c', categoryId: 'tools-equipment', amountCents: 120000, workUsePercent: 60 }),
    ];

    const grouped = groupByCategory(receipts).reduce((sum, group) => sum + group.totalCents, 0);
    expect(totalClaimedCents(receipts)).toBe(grouped);
  });
});

describe('searchReceipts', () => {
  const receipts = [
    receipt({ id: 'a', merchant: 'Officeworks', categoryId: 'stationery', amountCents: 4995 }),
    receipt({
      id: 'b',
      merchant: 'Bunnings',
      categoryId: 'tools-equipment',
      amountCents: 120000,
      notes: 'Drill for the Fremantle site',
    }),
    receipt({ id: 'c', merchant: 'Telstra', categoryId: 'phone-internet', amountCents: 11000 }),
  ];

  it('returns everything for an empty query', () => {
    expect(searchReceipts(receipts, '')).toHaveLength(3);
  });

  it('returns everything for a whitespace-only query', () => {
    // An untouched search box shouldn't hide the list.
    expect(searchReceipts(receipts, '   ')).toHaveLength(3);
  });

  it('matches the merchant, ignoring case', () => {
    expect(searchReceipts(receipts, 'bunnings').map((r) => r.id)).toEqual(['b']);
    expect(searchReceipts(receipts, 'BUNNINGS').map((r) => r.id)).toEqual(['b']);
  });

  it('matches a partial word', () => {
    expect(searchReceipts(receipts, 'office').map((r) => r.id)).toEqual(['a']);
  });

  it('matches notes', () => {
    expect(searchReceipts(receipts, 'fremantle').map((r) => r.id)).toEqual(['b']);
  });

  it('matches the category name, which is never shown as an id', () => {
    expect(searchReceipts(receipts, 'phone').map((r) => r.id)).toEqual(['c']);
  });

  it('matches an amount as typed', () => {
    expect(searchReceipts(receipts, '49.95').map((r) => r.id)).toEqual(['a']);
  });

  it('matches an amount as displayed, with the separator', () => {
    // formatCents renders 120000 as "$1,200.00" — a user searching what they
    // saw on screen should find it.
    expect(searchReceipts(receipts, '$1,200.00').map((r) => r.id)).toEqual(['b']);
  });

  it('matches the purchase date in stored form', () => {
    expect(searchReceipts(receipts, '2025-08-15')).toHaveLength(3);
  });

  it('requires every term, so more words narrow the result', () => {
    expect(searchReceipts(receipts, 'drill fremantle').map((r) => r.id)).toEqual(['b']);
    expect(searchReceipts(receipts, 'drill officeworks')).toEqual([]);
  });

  it('ignores extra spaces between terms', () => {
    expect(searchReceipts(receipts, '  drill    fremantle  ').map((r) => r.id)).toEqual(['b']);
  });

  it('returns nothing when there is no match', () => {
    expect(searchReceipts(receipts, 'qantas')).toEqual([]);
  });

  it('preserves the order it was given', () => {
    // The repository already sorted by purchase date; search must not reshuffle.
    expect(searchReceipts(receipts, '2025').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('financialYearOptions', () => {
  it('offers the current year when there are no receipts at all', () => {
    // First launch: a selector that couldn't reach the current year is a dead end.
    expect(financialYearOptions([], 2026)).toEqual([2026]);
  });

  it('does not duplicate the current year', () => {
    expect(financialYearOptions([2026, 2025], 2026)).toEqual([2026, 2025]);
  });

  it('adds the current year to years that have data', () => {
    expect(financialYearOptions([2024, 2023], 2026)).toEqual([2026, 2024, 2023]);
  });

  it('lists newest first', () => {
    expect(financialYearOptions([2023, 2026, 2024], 2025)).toEqual([2026, 2025, 2024, 2023]);
  });

  it('keeps a year ahead of the current one', () => {
    // Possible when a device's clock or timezone puts a purchase in a later FY;
    // hiding the year would hide the receipts filed under it.
    expect(financialYearOptions([2027], 2026)).toEqual([2027, 2026]);
  });
});
