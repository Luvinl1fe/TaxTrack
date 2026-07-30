/**
 * The working-from-home fixed rate method.
 *
 * Claim = hours worked from home × the year's cents-per-hour rate. No separate
 * home office is required, and no floor-area apportionment is involved.
 *
 * **What the rate already covers** (PCG 2023/1): electricity and gas, home and
 * mobile phone, internet, stationery and computer consumables. Those cannot also
 * be claimed as receipts — the single most likely way a user of this app
 * accidentally over-claims, since `phone-internet` and `stationery` are both
 * receipt categories. `conflictingCategoryIds()` finds it so a screen can say so.
 *
 * **What is still claimable separately:** the decline in value of assets like a
 * desk, chair or computer, and repairs to them. Those are `tools-equipment`
 * receipts and are deliberately *not* treated as conflicts.
 *
 * **Records:** the ATO requires a record of the *total hours actually worked* from
 * home for the whole year — an estimate or a representative four-week diary is no
 * longer enough. That is precisely what this log is, which is why hours are
 * entered per day rather than as a single annual figure.
 *
 * @see PHASE_1_PLAN.md §6; PCG 2023/1
 */

import { resolveRate } from '@/config/atoRates';
import type { CategoryTotal, WfhLog } from '@/domain/types';

/**
 * Receipt categories the fixed rate already pays for.
 *
 * Claiming these as receipts *and* using the fixed rate is double-dipping on the
 * same expense. Kept as ids rather than a flag on the category so the reason
 * stays visible here, next to the rule it comes from.
 */
export const WFH_FIXED_RATE_COVERS: readonly string[] = ['phone-internet', 'stationery'];

export interface WfhCalculation {
  /** Hours logged for the year. */
  totalHours: number;
  /** Days with at least one log. */
  dayCount: number;
  logCount: number;
  claimableCents: number;
  /** Cents per hour applied. */
  centsPerHour: number;
  /** True when `centsPerHour` is an assumption standing in for an unpublished rate. */
  provisional: boolean;
}

/**
 * Work out the claim for a financial year.
 *
 * Returns `null` when the year has no rate at all — published or provisional — so
 * the screen shows `rateUnavailableMessage()` rather than a figure derived from
 * nothing.
 *
 * Pass only the logs for the year in question. This does no filtering, because
 * the repository's query already does and doing it twice invites disagreement.
 */
export function calculateWfhClaim(logs: WfhLog[], fy: number): WfhCalculation | null {
  const rate = resolveRate(fy, 'wfhCentsPerHour');
  if (rate === null) return null;

  // Summed in TypeScript rather than read from SQL's SUM() so the figure and the
  // rows on screen come from one place. `hours` is REAL, so this carries the
  // usual binary-fraction error — immaterial here because it is resolved by a
  // single rounding at the end, below, rather than compounding per row.
  const totalHours = logs.reduce((sum, log) => sum + log.hours, 0);

  return {
    totalHours,
    dayCount: new Set(logs.map((log) => log.date)).size,
    logCount: logs.length,
    // Rounded once, here. Hours are fractional and the rate is whole cents, so
    // the product is fractional cents, which have no meaning on a return.
    claimableCents: Math.round(totalHours * rate.cents),
    centsPerHour: rate.cents,
    provisional: rate.provisional,
  };
}

/**
 * Receipt categories in this year's claim that the fixed rate already covers.
 *
 * Only reports categories with a non-zero total, so a category the user merely
 * looked at never raises a warning. Returns ids; the caller resolves names.
 */
export function conflictingCategoryIds(totals: CategoryTotal[]): string[] {
  return totals
    .filter((total) => WFH_FIXED_RATE_COVERS.includes(total.categoryId) && total.totalCents > 0)
    .map((total) => total.categoryId);
}

/** Total of the receipts that clash with the fixed rate, in cents. */
export function conflictingCents(totals: CategoryTotal[]): number {
  return totals
    .filter((total) => WFH_FIXED_RATE_COVERS.includes(total.categoryId))
    .reduce((sum, total) => sum + total.totalCents, 0);
}

/**
 * Hours already logged on a date, excluding one log by id.
 *
 * The exclusion is for the edit case: a log being edited must not count itself as
 * a duplicate of itself. Used to warn about a day whose total looks impossible.
 */
export function hoursLoggedOn(logs: WfhLog[], date: string, exceptId?: string): number {
  return logs
    .filter((log) => log.date === date && log.id !== exceptId)
    .reduce((sum, log) => sum + log.hours, 0);
}
