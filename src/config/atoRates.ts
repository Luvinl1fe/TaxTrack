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
   * Substantiation threshold. Where the year's *aggregate* claims across the
   * categories this rule covers are at or below this amount, full written
   * evidence isn't required — a record of how the claim was worked out is.
   *
   * An *evidence* threshold, not a cap on what may be claimed. Wording it as
   * "claim $300 without receipts" is a common and costly misreading.
   *
   * Which categories it covers is a per-category property, not a global one —
   * see `countsTowardSubstantiationThreshold` in `@/domain/categories`. Car
   * expenses in particular are excluded and have their own rules.
   *
   * Applies to a *total across receipts*. Contrast
   * `immediateWriteOffThresholdCents`, which applies per individual asset.
   */
  substantiationThresholdCents: number;
  /**
   * Immediate write-off threshold for depreciating assets. An asset costing at
   * or below this is deductible in full in the year of purchase; above it, the
   * cost is written off over the asset's effective life.
   *
   * Same $300 figure as `substantiationThresholdCents` and a completely
   * unrelated rule — one is an aggregate evidence test, this is a per-asset
   * accounting test. They are separate fields precisely so no calculator can
   * reach for "the $300 one" and get the wrong rule.
   *
   * Recorded here for correct labelling, but depreciation itself is Phase 3
   * and is not modelled in Phase 1.
   */
  immediateWriteOffThresholdCents: number;
}

/** The rate keys that may legitimately be absent for a given year. */
export type NullableRate = 'wfhCentsPerHour' | 'centsPerKm';

const KM_CAP_PER_CAR = 5_000;
const SUBSTANTIATION_THRESHOLD_CENTS = 30_000; // $300
const IMMEDIATE_WRITE_OFF_THRESHOLD_CENTS = 30_000; // $300, unrelated rule

/**
 * Keyed by financial-year start year: `2026` is the 2026–27 financial year.
 *
 * Sources are cited per-rate below. Prefer legislative instruments and
 * guidelines over ato.gov.au's calculator and guidance pages — those pages lag
 * behind the instruments that actually set the rate, sometimes by months.
 */
export const ATO_RATES: Record<number, FyRates> = {
  // 2024–25
  2024: {
    wfhCentsPerHour: 70, // PCG 2023/1
    centsPerKm: 88,
    kmCapPerCar: KM_CAP_PER_CAR,
    substantiationThresholdCents: SUBSTANTIATION_THRESHOLD_CENTS,
    immediateWriteOffThresholdCents: IMMEDIATE_WRITE_OFF_THRESHOLD_CENTS,
  },
  // 2025–26
  2025: {
    wfhCentsPerHour: 70, // PCG 2023/1
    centsPerKm: 88,
    kmCapPerCar: KM_CAP_PER_CAR,
    substantiationThresholdCents: SUBSTANTIATION_THRESHOLD_CENTS,
    immediateWriteOffThresholdCents: IMMEDIATE_WRITE_OFF_THRESHOLD_CENTS,
  },
  // 2026–27 — the year the app is being built for.
  2026: {
    // NOT YET PUBLISHED — not merely unverified. The ATO's fixed rate method
    // page (revised 8 June 2026) lists rates only through 2025–26. The last
    // published figure was 70c/hour for 2024–25 and 2025–26 under PCG 2023/1.
    //
    // TODO: set this once the ATO publishes the 2026–27 rate. Do not assume
    // 70c carries forward — a plausible-looking wrong rate on a tax return is
    // this app's worst failure mode. Release gate, see PHASE_1_PLAN.md §12.
    wfhCentsPerHour: null,
    // 89c base + a one-off 2c uplift for 2026–27.
    //
    // Source: legislative instrument LI 2026/19, NOT ato.gov.au's cents per
    // kilometre page — that page still showed 88c at time of writing. The
    // instrument is authoritative; the guidance page trails it.
    centsPerKm: 91,
    kmCapPerCar: KM_CAP_PER_CAR,
    substantiationThresholdCents: SUBSTANTIATION_THRESHOLD_CENTS,
    immediateWriteOffThresholdCents: IMMEDIATE_WRITE_OFF_THRESHOLD_CENTS,
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
