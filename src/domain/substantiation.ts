/**
 * The s 900-35 aggregate substantiation test.
 *
 * If a year's total work expenses are $300 or less, they can be claimed
 * without written evidence. Over $300 and **every** work expense must be
 * substantiated — not merely the amount above $300. It is a cliff, not an
 * excess, which is why `crossed` matters more than any "amount over" figure.
 *
 * Excluded from the total: car expenses, travel allowance expenses, meal
 * allowance expenses, and award transport payments (s 900-35(3)). Car is
 * excluded per category; the rest are per receipt, since the same flight
 * counts or doesn't depending on whether an allowance covered it.
 *
 * This is an *evidence* test. It never caps what may be claimed, and the
 * taxpayer must still show how the claim was worked out either way.
 *
 * @see ITAA 1997 s 900-35; TR 1999/10
 */

import { ratesForFy } from '@/config/atoRates';
import { categoryById } from '@/domain/categories';
import { deductibleCents, type Receipt } from '@/domain/types';

export interface SubstantiationStatus {
  /** Total of in-scope work expenses for the year, in cents. */
  totalCents: number;
  /** The threshold applied, in cents. */
  thresholdCents: number;
  /** True once the total exceeds the threshold. */
  crossed: boolean;
  /** Cents remaining before crossing. Zero once crossed. */
  remainingCents: number;
  /** Receipts excluded from the total, and why. */
  excluded: { receiptId: string; reason: ExclusionReason }[];
}

export type ExclusionReason =
  | 'deleted'
  | 'unknown_category'
  | 'category_out_of_scope'
  | 'travel_allowance'
  | 'meal_allowance'
  | 'award_transport';

/** Why a receipt is outside the aggregate, or `null` if it counts. */
export function exclusionReason(receipt: Receipt): ExclusionReason | null {
  if (receipt.deletedAt !== null) return 'deleted';

  const category = categoryById(receipt.categoryId);
  if (category === null) return 'unknown_category';
  if (!category.countsTowardSubstantiationThreshold) return 'category_out_of_scope';

  // Per-expense statutory exclusions outrank the category default.
  if (receipt.substantiationExemption !== null) return receipt.substantiationExemption;

  return null;
}

/**
 * Evaluate the test for a financial year.
 *
 * Throws if the year has no rates on file rather than assuming $300 — the
 * threshold is a published figure like any other and shouldn't be guessed.
 */
export function substantiationStatus(receipts: Receipt[], fy: number): SubstantiationStatus {
  const rates = ratesForFy(fy);
  if (rates === null) {
    throw new RangeError(`No ATO rates on file for financial year ${fy}`);
  }
  const thresholdCents = rates.substantiationThresholdCents;

  let totalCents = 0;
  const excluded: SubstantiationStatus['excluded'] = [];

  for (const receipt of receipts) {
    const reason = exclusionReason(receipt);
    if (reason !== null) {
      excluded.push({ receiptId: receipt.id, reason });
      continue;
    }
    totalCents += deductibleCents(receipt);
  }

  const crossed = totalCents > thresholdCents;

  return {
    totalCents,
    thresholdCents,
    crossed,
    remainingCents: crossed ? 0 : thresholdCents - totalCents,
    excluded,
  };
}

/**
 * User-facing copy for the nudge.
 *
 * Deliberately never says "you can claim $300 without receipts" — the
 * threshold governs evidence, not entitlement, and that phrasing is the
 * misreading this feature exists to prevent.
 */
export function substantiationMessage(status: SubstantiationStatus): string {
  const threshold = formatCents(status.thresholdCents);

  if (status.crossed) {
    return (
      `Your work expenses have passed ${threshold}, so you now need written evidence ` +
      `for all of them — not just the amount above ${threshold}.`
    );
  }

  return (
    `You're ${formatCents(status.remainingCents)} away from ${threshold}. ` +
    `Past that, every work expense needs written evidence, so it's worth keeping receipts now.`
  );
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
}

/** Re-exported for callers that only need the threshold figure. */
export function thresholdCentsForFy(fy: number): number | null {
  return ratesForFy(fy)?.substantiationThresholdCents ?? null;
}

/** Kept alongside so the two $300 rules stay visibly distinct at the call site. */
export function immediateWriteOffThresholdCentsForFy(fy: number): number | null {
  return ratesForFy(fy)?.immediateWriteOffThresholdCents ?? null;
}
