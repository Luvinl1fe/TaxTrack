/**
 * ATO rates and thresholds, keyed by financial year.
 *
 * Every figure the app uses to compute a claimable amount lives here and
 * nowhere else. These change between financial years, and a number hardcoded
 * inside calculator logic is a wrong claim for every user the year it moves.
 * Calculators must read from this table — never embed a literal.
 *
 * A `null` rate means "not published or not yet verified for that year". It is
 * deliberately not a fallback to the previous year's figure: quietly computing
 * a deduction with a stale rate is worse than showing nothing, because the user
 * has no way to tell it happened. Callers must handle `null` and surface
 * `rateUnavailableMessage()` instead.
 *
 * @see PHASE_1_PLAN.md §6
 */

import { fyLabel } from '@/lib/financialYear';

export interface FyRates {
  /** Working-from-home fixed-rate method, cents per hour worked from home. */
  wfhCentsPerHour: number | null;
  /** Cents-per-kilometre method rate for car expenses. */
  centsPerKm: number | null;
  /** Maximum kilometres claimable per car, per year, under the cents-per-km method. */
  kmCapPerCar: number;
  /**
   * Written evidence is not required where total work-related claims for the
   * year are at or below this amount.
   *
   * This is an *evidence* threshold, not a cap on what may be claimed, and the
   * taxpayer must still be able to show how the claim was worked out. Wording
   * it as "claim $300 without receipts" is a common and costly misreading.
   */
  noReceiptThresholdCents: number;
}

/** The rate keys that may legitimately be absent for a given year. */
export type NullableRate = 'wfhCentsPerHour' | 'centsPerKm';

const KM_CAP_PER_CAR = 5_000;
const NO_RECEIPT_THRESHOLD_CENTS = 30_000; // $300

/**
 * Keyed by financial-year start year: `2026` is the 2026–27 financial year.
 *
 * Verified July 2026. `ato.gov.au` returns HTTP 403 to automated requests, so
 * the cents-per-km figures were corroborated across two independent published
 * sources rather than read from the ATO directly.
 */
export const ATO_RATES: Record<number, FyRates> = {
  // 2024–25
  2024: {
    wfhCentsPerHour: 70,
    centsPerKm: 88,
    kmCapPerCar: KM_CAP_PER_CAR,
    noReceiptThresholdCents: NO_RECEIPT_THRESHOLD_CENTS,
  },
  // 2025–26
  2025: {
    wfhCentsPerHour: 70,
    centsPerKm: 88,
    kmCapPerCar: KM_CAP_PER_CAR,
    noReceiptThresholdCents: NO_RECEIPT_THRESHOLD_CENTS,
  },
  // 2026–27 — the year the app is being built for.
  2026: {
    // UNCONFIRMED. PCG 2023/1 set 70c and that rate applied through 2025–26,
    // so it most likely carries forward — but "most likely" is not good enough
    // for a number that lands on someone's tax return. A human must confirm
    // this against ato.gov.au before shipping the WFH calculator.
    // See PHASE_1_PLAN.md §12.
    wfhCentsPerHour: null,
    // 89c base + a one-off 2c uplift for 2026–27.
    centsPerKm: 91,
    kmCapPerCar: KM_CAP_PER_CAR,
    noReceiptThresholdCents: NO_RECEIPT_THRESHOLD_CENTS,
  },
};

/** The earliest and latest financial years the rates table covers. */
export function supportedFyRange(): { earliest: number; latest: number } {
  const years = Object.keys(ATO_RATES).map(Number);
  return {
    earliest: Math.min(...years),
    latest: Math.max(...years),
  };
}

/** Rates for a financial year, or `null` if that year isn't in the table. */
export function ratesForFy(fy: number): FyRates | null {
  return ATO_RATES[fy] ?? null;
}

/**
 * A single rate for a financial year, or `null` if the year is unknown or the
 * rate hasn't been published yet. Callers must distinguish `null` from `0`.
 */
export function getRate(fy: number, rate: NullableRate): number | null {
  return ratesForFy(fy)?.[rate] ?? null;
}

const RATE_DESCRIPTIONS: Record<NullableRate, string> = {
  wfhCentsPerHour: 'working-from-home fixed rate',
  centsPerKm: 'cents-per-kilometre rate',
};

/** User-facing explanation for why a calculator can't produce a number. */
export function rateUnavailableMessage(fy: number, rate: NullableRate): string {
  return `The ${RATE_DESCRIPTIONS[rate]} for ${fyLabel(fy)} isn't available yet, so this can't be calculated.`;
}
