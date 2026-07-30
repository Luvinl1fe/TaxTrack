/**
 * Search, grouping and year selection for the receipt list and dashboard.
 *
 * Pure, and deliberately outside the screens — the same reasoning as
 * `receiptForm.ts`. Screens have no automated tests by design
 * (`KNOWN_GAPS.md`), so anything that decides what the user sees lives here
 * where it can be tested without a renderer.
 */

import { categoryById } from '@/domain/categories';
import { deductibleCents, type Receipt } from '@/domain/types';
import { formatCents } from '@/lib/money';

/** A category's receipts, with the apportioned total the dashboard shows. */
export interface CategoryGroup {
  categoryId: string;
  /** The category's name, or its raw id if a later build dropped it. */
  categoryName: string;
  receipts: Receipt[];
  /**
   * Sum of the deductible portions, in cents.
   *
   * Uses `deductibleCents` per receipt and then sums — the same order of
   * operations as `totalsByCategory`'s SQL, which rounds each row before
   * `SUM()`. Rounding the sum instead would disagree by a cent or two.
   */
  totalCents: number;
}

/** A category's display name, falling back to its id rather than showing blank. */
export function categoryName(categoryId: string): string {
  return categoryById(categoryId)?.name ?? categoryId;
}

/**
 * Group receipts by category, largest total first.
 *
 * Ordered to match `totalsByCategory` so the dashboard and the list read in the
 * same sequence. Ties break on name so the order is stable between renders
 * rather than depending on insertion order.
 */
export function groupByCategory(receipts: Receipt[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();

  for (const receipt of receipts) {
    let group = groups.get(receipt.categoryId);
    if (group === undefined) {
      group = {
        categoryId: receipt.categoryId,
        categoryName: categoryName(receipt.categoryId),
        receipts: [],
        totalCents: 0,
      };
      groups.set(receipt.categoryId, group);
    }

    group.receipts.push(receipt);
    group.totalCents += deductibleCents(receipt);
  }

  return [...groups.values()].sort(
    (a, b) => b.totalCents - a.totalCents || a.categoryName.localeCompare(b.categoryName),
  );
}

/** Total of the deductible portions across every receipt given, in cents. */
export function totalClaimedCents(receipts: Receipt[]): number {
  return receipts.reduce((sum, receipt) => sum + deductibleCents(receipt), 0);
}

/**
 * The text a receipt can be found by.
 *
 * Includes the amount both as typed (`49.95`) and as displayed (`$49.95`),
 * because people look for a purchase by what it cost as readily as by who they
 * bought it from.
 */
function haystack(receipt: Receipt): string {
  return [
    receipt.merchant,
    receipt.notes ?? '',
    categoryName(receipt.categoryId),
    formatCents(receipt.amountCents),
    receipt.purchaseDate,
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * Filter receipts by a free-text query.
 *
 * Every whitespace-separated term must match somewhere, so "office pens" narrows
 * rather than widening — typing more words should never return more rows. An
 * empty or whitespace-only query returns everything, which is what an untouched
 * search box means.
 */
export function searchReceipts(receipts: Receipt[], query: string): Receipt[] {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 0);
  if (terms.length === 0) return receipts;

  return receipts.filter((receipt) => {
    const text = haystack(receipt);
    return terms.every((term) => text.includes(term));
  });
}

/**
 * Years to offer in the selector: every year with receipts, plus the current
 * one, newest first.
 *
 * The current year is always present even when empty — it's the year a new user
 * is about to enter receipts for, and a selector that couldn't reach it would be
 * a dead end on first launch.
 */
export function financialYearOptions(
  yearsWithReceipts: readonly number[],
  currentFy: number,
): number[] {
  return [...new Set([currentFy, ...yearsWithReceipts])].sort((a, b) => b - a);
}
