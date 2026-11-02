/**
 * The standard deduction for work-related expenses: itemise, or take the $1,000?
 *
 * From 2026–27, ITAA 1997 s 25-130 gives every resident with labour income a
 * deduction of $1,000, applied automatically and needing no receipts. It is
 * reduced dollar for dollar by the work expenses actually claimed, so it *tops
 * up* rather than adds: the year's work-related deduction is the larger of the
 * itemised total and $1,000, never the sum.
 *
 * So itemising only pays once expenses pass $1,000. Below that, claiming them
 * changes nothing except that, past $300, every one of them then needs written
 * evidence — the standard deduction needs none. At exactly $1,000 the two are
 * equal and the standard deduction wins on effort.
 *
 * **What counts** against it (s 25-130): general deductions incurred in gaining
 * labour income, car expenses under Division 28 — so cents-per-kilometre trips —
 * and decline in value of work assets. Working-from-home fixed-rate claims are
 * general deductions and count. Association memberships are expressly
 * disregarded, and gifts and tax-affairs costs aren't work expenses; all three
 * are claimed on top. The per-category answer is `countsTowardStandardDeduction`.
 *
 * **Not modelled:** the deduction is capped at the year's assessable labour
 * income. The app doesn't record income, so someone who earned under $1,000 in
 * wages gets less than this assumes. The copy says so rather than guessing.
 *
 * @see ITAA 1997 s 25-130; Treasury Laws Amendment (Tax Reform No. 1) Act 2026, Sch 4
 */

import { ratesForFy } from '@/config/atoRates';
import { categoryById } from '@/domain/categories';
import { deductibleCents, type Receipt } from '@/domain/types';
import type { VehicleCalculation } from '@/domain/vehicleCalculator';
import type { WfhCalculation } from '@/domain/wfhCalculator';
import { formatCents } from '@/lib/money';

export interface StandardDeductionComparison {
  /** The standard deduction for the year, in cents. */
  standardCents: number;
  /** Work expenses that count against it: receipts, car and working from home. */
  itemisedCents: number;
  /** The parts of `itemisedCents`, so the screen can show where it came from. */
  receiptsCents: number;
  vehicleCents: number;
  wfhCents: number;
  /** Which gives the larger deduction. Ties go to the standard deduction. */
  better: 'standard' | 'itemise';
  /** How far apart the two are. Always zero or more. */
  differenceCents: number;
  /** True when part of the total was computed from a provisional rate. */
  includesEstimate: boolean;
  /**
   * True when trips or hours exist but couldn't be valued because the year has
   * no rate for them. The itemised total is then an understatement.
   */
  incomplete: boolean;
}

export interface StandardDeductionInput {
  receipts: Receipt[];
  /** From `calculateVehicleClaim`; `null` when the year has no rate. */
  vehicle: VehicleCalculation | null;
  tripCount: number;
  /** From `calculateWfhClaim`; `null` when the year has no rate. */
  wfh: WfhCalculation | null;
  logCount: number;
}

/** Whether a receipt counts against the standard deduction. */
export function countsTowardStandardDeduction(receipt: Receipt): boolean {
  if (receipt.deletedAt !== null) return false;
  // An unknown category is left out rather than guessed at, the same as the
  // $300 test does. A guess here moves the recommendation.
  return categoryById(receipt.categoryId)?.countsTowardStandardDeduction === true;
}

/**
 * Compare itemised work expenses with the standard deduction for a year.
 *
 * Returns `null` for a year with no standard deduction — any year before
 * 2026–27, or one with no rates on file — so the screen shows nothing rather
 * than a comparison against a deduction that didn't exist.
 */
export function compareWithStandardDeduction(
  input: StandardDeductionInput,
  fy: number,
): StandardDeductionComparison | null {
  const standardCents = ratesForFy(fy)?.standardDeductionCents ?? null;
  if (standardCents === null) return null;

  const receiptsCents = input.receipts
    .filter(countsTowardStandardDeduction)
    .reduce((sum, receipt) => sum + deductibleCents(receipt), 0);
  const vehicleCents = input.vehicle?.totalClaimableCents ?? 0;
  const wfhCents = input.wfh?.claimableCents ?? 0;
  const itemisedCents = receiptsCents + vehicleCents + wfhCents;

  return {
    standardCents,
    itemisedCents,
    receiptsCents,
    vehicleCents,
    wfhCents,
    // Strictly greater: at a tie the deduction is the same either way, and the
    // standard one needs no evidence.
    better: itemisedCents > standardCents ? 'itemise' : 'standard',
    differenceCents: Math.abs(itemisedCents - standardCents),
    includesEstimate:
      (input.vehicle?.provisional === true && vehicleCents > 0) ||
      (input.wfh?.provisional === true && wfhCents > 0),
    incomplete:
      (input.vehicle === null && input.tripCount > 0) || (input.wfh === null && input.logCount > 0),
  };
}

/**
 * The answer, in a sentence a once-a-year taxpayer can act on.
 *
 * Never says the standard deduction is added to itemised expenses — it tops up
 * to $1,000, and "claim both" is the misreading worth heading off.
 */
export function standardDeductionMessage(comparison: StandardDeductionComparison): string {
  const standard = formatCents(comparison.standardCents);
  const itemised = formatCents(comparison.itemisedCents);
  const difference = formatCents(comparison.differenceCents);

  if (comparison.better === 'itemise') {
    return (
      `Your work expenses come to ${itemised}, which is ${difference} more than the ` +
      `${standard} standard deduction. Claiming them gets you the larger deduction, ` +
      `but you'll need records for all of them.`
    );
  }

  if (comparison.itemisedCents === 0) {
    return (
      `The ${standard} standard deduction is applied automatically, with no receipts. ` +
      `Itemising is only worth it once your work expenses pass ${standard}.`
    );
  }

  return (
    `Your work expenses come to ${itemised}, which is ${difference} short of ` +
    `${standard}. The standard deduction gives you more and needs no receipts — ` +
    `it isn't added on top of your expenses, it replaces them.`
  );
}

/**
 * What the $300 evidence card should add while the standard deduction wins.
 *
 * The evidence rule only bites on expenses actually claimed. Below the standard
 * deduction, the advice is not to claim them — so "every work expense needs
 * written evidence" on its own reads as contradicting "no receipts needed".
 * Returns `null` when there's nothing to add: no standard deduction that year,
 * or itemising wins and the evidence rule applies in full.
 */
export function evidenceTestNote(comparison: StandardDeductionComparison | null): string | null {
  if (comparison === null || comparison.better === 'itemise') return null;

  return (
    `This only matters if you itemise. While your work expenses are under ` +
    `${formatCents(comparison.standardCents)}, the standard deduction gives you more ` +
    `and needs no receipts — but keep them anyway, in case your expenses pass it.`
  );
}
