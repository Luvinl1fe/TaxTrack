/**
 * Repository interfaces.
 *
 * Screens talk to these, never to SQLite directly. The point is that the
 * SQLite implementation and a later Firestore-backed one stay interchangeable
 * — when Firebase lands in milestone 8, it implements these interfaces rather
 * than rewriting every screen.
 *
 * Deletes are soft everywhere: a hard delete can't be replicated to another
 * device, which would resurrect the record on next sync.
 *
 * @see PHASE_1_PLAN.md §4
 */

import type { CategoryTotal, Receipt, VehicleTrip, WfhLog } from '@/domain/types';

export interface ListOptions {
  categoryId?: string;
  /** Include soft-deleted records. Defaults to false. */
  includeDeleted?: boolean;
}

export interface ReceiptRepository {
  list(fy: number, opts?: ListOptions): Promise<Receipt[]>;
  get(id: string): Promise<Receipt | null>;
  save(receipt: Receipt): Promise<void>;
  softDelete(id: string): Promise<void>;
  totalsByCategory(fy: number): Promise<CategoryTotal[]>;
  /**
   * Financial years holding at least one receipt, newest first.
   *
   * Drives the dashboard's year selector. Derived from the data rather than
   * offering a fixed range, because someone entering last year's receipts in
   * July needs that year and nobody needs a year they never used.
   */
  financialYearsWithReceipts(): Promise<number[]>;
}

export interface WfhLogRepository {
  list(fy: number): Promise<WfhLog[]>;
  get(id: string): Promise<WfhLog | null>;
  save(log: WfhLog): Promise<void>;
  softDelete(id: string): Promise<void>;
  /** Total hours worked from home in the year. */
  totalHours(fy: number): Promise<number>;
  /**
   * Financial years holding at least one log, newest first.
   *
   * Unioned into the year selector alongside the receipt and trip years, so a
   * year spent only logging hours is still reachable.
   */
  financialYearsWithLogs(): Promise<number[]>;
}

export interface VehicleTripRepository {
  list(fy: number): Promise<VehicleTrip[]>;
  get(id: string): Promise<VehicleTrip | null>;
  save(trip: VehicleTrip): Promise<void>;
  softDelete(id: string): Promise<void>;
  /** Kilometres per vehicle. The 5,000km cap applies per car, not per person. */
  kilometresByVehicle(fy: number): Promise<{ vehicleLabel: string; kilometres: number }[]>;
  /**
   * Vehicle labels already used, most recently first, across all years.
   *
   * So the entry form can offer the cars a user has already logged instead of
   * asking them to retype the name. Labels are matched exactly, so 'Hilux' and
   * 'hilux' would be two cars with two separate 5,000km caps — picking from a
   * list is what prevents that.
   */
  vehicleLabels(): Promise<string[]>;
  /**
   * Financial years holding at least one trip, newest first.
   *
   * The year selector unions this with the receipt years. Without it, a year in
   * which someone logged trips but saved no receipts would be missing from the
   * picker — and so unreachable, exactly the bug the selector was added to fix.
   */
  financialYearsWithTrips(): Promise<number[]>;
}
