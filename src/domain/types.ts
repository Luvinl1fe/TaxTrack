/**
 * Core domain types.
 *
 * Money is **integer cents** everywhere — never a float, never a formatted
 * string. `$49.95` is `4995`. Float arithmetic on currency produces wrong
 * totals, and this app's output goes on a tax return.
 *
 * Dates are `YYYY-MM-DD` strings; see `@/lib/financialYear` for why.
 */

import type { IsoDate } from '@/lib/financialYear';

/** ISO 8601 timestamp with timezone, e.g. `2026-07-29T04:15:00.000Z`. */
export type IsoTimestamp = string;

/**
 * Why an expense sits outside the s 900-35 aggregate substantiation test,
 * despite belonging to a category that otherwise counts.
 *
 * The statutory exclusions are car expenses, travel allowance expenses, meal
 * allowance expenses and award transport payments. Car is excluded at the
 * category level because every car expense is excluded; the other three are
 * properties of the individual expense — a flight paid out of pocket counts,
 * the same flight covered by a travel allowance does not.
 *
 * `null` means the expense counts normally.
 *
 * @see ITAA 1997 s 900-35, s 900-35(3); TR 1999/10
 */
export type SubstantiationExemption =
  | 'travel_allowance'
  | 'meal_allowance'
  | 'award_transport';

export const SUBSTANTIATION_EXEMPTIONS: readonly SubstantiationExemption[] = [
  'travel_allowance',
  'meal_allowance',
  'award_transport',
];

/** Where a record is in its sync lifecycle. Unused until Firebase lands. */
export type SyncState = 'pending' | 'synced';

/** Fields every syncable record carries, present from day one (see §4). */
export interface SyncFields {
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  /** Soft-delete tombstone. `null` means live. */
  deletedAt: IsoTimestamp | null;
  /** Firestore document id. `null` until first synced. */
  serverId: string | null;
  syncState: SyncState;
}

export interface Receipt extends SyncFields {
  /** Client-generated UUID, stable across sync. */
  id: string;
  merchant: string;
  amountCents: number;
  /** GST component, where known. `null` if not recorded. */
  gstCents: number | null;
  purchaseDate: IsoDate;
  /** FY start year: 2026 means 2026–27. Stored, not derived — see §4. */
  financialYear: number;
  categoryId: string;
  /** 0–100. The deductible share of `amountCents`. */
  workUsePercent: number;
  notes: string | null;
  /** `file://` path in the app documents directory. Never a blob. */
  photoUri: string | null;
  /** Non-null only where a statutory exclusion applies. */
  substantiationExemption: SubstantiationExemption | null;
}

export interface WfhLog extends SyncFields {
  id: string;
  date: IsoDate;
  financialYear: number;
  /** Hours worked from home. Fractional hours are legitimate. */
  hours: number;
  notes: string | null;
}

export interface VehicleTrip extends SyncFields {
  id: string;
  date: IsoDate;
  financialYear: number;
  kilometres: number;
  purpose: string;
  /** Free-text label. The 5,000km cap is per car, so trips group by this. */
  vehicleLabel: string;
}

export interface CategoryTotal {
  categoryId: string;
  totalCents: number;
  receiptCount: number;
}

/**
 * The deductible portion of a receipt, in whole cents.
 *
 * Rounds half up at the final step rather than truncating, and only ever
 * returns an integer — a fractional cent has no meaning on a tax return.
 */
export function deductibleCents(receipt: Pick<Receipt, 'amountCents' | 'workUsePercent'>): number {
  return Math.round((receipt.amountCents * receipt.workUsePercent) / 100);
}
