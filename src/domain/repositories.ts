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
}

export interface WfhLogRepository {
  list(fy: number): Promise<WfhLog[]>;
  get(id: string): Promise<WfhLog | null>;
  save(log: WfhLog): Promise<void>;
  softDelete(id: string): Promise<void>;
  /** Total hours worked from home in the year. */
  totalHours(fy: number): Promise<number>;
}

export interface VehicleTripRepository {
  list(fy: number): Promise<VehicleTrip[]>;
  get(id: string): Promise<VehicleTrip | null>;
  save(trip: VehicleTrip): Promise<void>;
  softDelete(id: string): Promise<void>;
  /** Kilometres per vehicle. The 5,000km cap applies per car, not per person. */
  kilometresByVehicle(fy: number): Promise<{ vehicleLabel: string; kilometres: number }[]>;
}
