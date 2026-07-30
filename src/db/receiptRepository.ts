/**
 * SQLite-backed repositories.
 *
 * When Firestore arrives in milestone 8 it implements the same interfaces from
 * `@/domain/repositories`, and screens don't change.
 */

import * as Crypto from 'expo-crypto';

import { getDatabase } from '@/db/database';
import {
  RECEIPT_COLUMNS,
  VEHICLE_TRIP_COLUMNS,
  WFH_LOG_COLUMNS,
  fromReceipt,
  fromVehicleTrip,
  fromWfhLog,
  toReceipt,
  toVehicleTrip,
  toWfhLog,
  upsertSql,
  type BindValue,
  type ReceiptRow,
  type VehicleTripRow,
  type WfhLogRow,
} from '@/db/mappers';
import type {
  ListOptions,
  ReceiptRepository,
  VehicleTripRepository,
  WfhLogRepository,
} from '@/domain/repositories';
import type { CategoryTotal, Receipt, VehicleTrip, WfhLog } from '@/domain/types';

/** A fresh record id. Client-generated so records exist before any sync. */
export function newId(): string {
  return Crypto.randomUUID();
}

export function nowTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Stamp a record as locally modified.
 *
 * Any local write marks the row `pending` so the sync pass in milestone 8 can
 * find it, and bumps `updated_at`, which is the field last-write-wins compares.
 */
export function markUpdated<T extends { updatedAt: string; syncState: string }>(record: T): T {
  return { ...record, updatedAt: nowTimestamp(), syncState: 'pending' };
}

class SqliteReceiptRepository implements ReceiptRepository {
  async list(fy: number, opts: ListOptions = {}): Promise<Receipt[]> {
    const db = await getDatabase();

    const conditions = ['financial_year = ?'];
    const params: BindValue[] = [fy];

    if (!opts.includeDeleted) conditions.push('deleted_at IS NULL');
    if (opts.categoryId !== undefined) {
      conditions.push('category_id = ?');
      params.push(opts.categoryId);
    }

    const rows = await db.getAllAsync<ReceiptRow>(
      `SELECT * FROM receipts
       WHERE ${conditions.join(' AND ')}
       ORDER BY purchase_date DESC, created_at DESC`,
      params,
    );

    return rows.map(toReceipt);
  }

  async get(id: string): Promise<Receipt | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<ReceiptRow>('SELECT * FROM receipts WHERE id = ?', [id]);
    return row ? toReceipt(row) : null;
  }

  async save(receipt: Receipt): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(upsertSql('receipts', RECEIPT_COLUMNS), fromReceipt(receipt));
  }

  async softDelete(id: string): Promise<void> {
    const db = await getDatabase();
    const now = nowTimestamp();
    // Tombstone rather than DELETE: a hard delete can't replicate, so the row
    // would come back from another device on the next sync.
    await db.runAsync(
      `UPDATE receipts SET deleted_at = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
      [now, now, id],
    );
  }

  async totalsByCategory(fy: number): Promise<CategoryTotal[]> {
    const db = await getDatabase();

    // Apportioned in SQL so the total matches deductibleCents(), which rounds
    // half up. SQLite's ROUND() rounds half away from zero, and amounts are
    // non-negative, so the two agree.
    const rows = await db.getAllAsync<{
      category_id: string;
      total_cents: number;
      receipt_count: number;
    }>(
      `SELECT category_id,
              CAST(SUM(ROUND(amount_cents * work_use_percent / 100.0)) AS INTEGER) AS total_cents,
              COUNT(*) AS receipt_count
       FROM receipts
       WHERE financial_year = ? AND deleted_at IS NULL
       GROUP BY category_id
       ORDER BY total_cents DESC`,
      [fy],
    );

    return rows.map((row) => ({
      categoryId: row.category_id,
      totalCents: row.total_cents,
      receiptCount: row.receipt_count,
    }));
  }

  async financialYearsWithReceipts(): Promise<number[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ financial_year: number }>(
      `SELECT DISTINCT financial_year
       FROM receipts
       WHERE deleted_at IS NULL
       ORDER BY financial_year DESC`,
    );
    return rows.map((row) => row.financial_year);
  }
}

class SqliteWfhLogRepository implements WfhLogRepository {
  async list(fy: number): Promise<WfhLog[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<WfhLogRow>(
      `SELECT * FROM wfh_logs
       WHERE financial_year = ? AND deleted_at IS NULL
       ORDER BY log_date DESC`,
      [fy],
    );
    return rows.map(toWfhLog);
  }

  async get(id: string): Promise<WfhLog | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<WfhLogRow>('SELECT * FROM wfh_logs WHERE id = ?', [id]);
    return row ? toWfhLog(row) : null;
  }

  async save(log: WfhLog): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(upsertSql('wfh_logs', WFH_LOG_COLUMNS), fromWfhLog(log));
  }

  async softDelete(id: string): Promise<void> {
    const db = await getDatabase();
    const now = nowTimestamp();
    await db.runAsync(
      `UPDATE wfh_logs SET deleted_at = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
      [now, now, id],
    );
  }

  async totalHours(fy: number): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ total: number | null }>(
      'SELECT SUM(hours) AS total FROM wfh_logs WHERE financial_year = ? AND deleted_at IS NULL',
      [fy],
    );
    return row?.total ?? 0;
  }

  async financialYearsWithLogs(): Promise<number[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ financial_year: number }>(
      `SELECT DISTINCT financial_year
       FROM wfh_logs
       WHERE deleted_at IS NULL
       ORDER BY financial_year DESC`,
    );
    return rows.map((row) => row.financial_year);
  }
}

class SqliteVehicleTripRepository implements VehicleTripRepository {
  async list(fy: number): Promise<VehicleTrip[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<VehicleTripRow>(
      `SELECT * FROM vehicle_trips
       WHERE financial_year = ? AND deleted_at IS NULL
       ORDER BY trip_date DESC`,
      [fy],
    );
    return rows.map(toVehicleTrip);
  }

  async get(id: string): Promise<VehicleTrip | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<VehicleTripRow>(
      'SELECT * FROM vehicle_trips WHERE id = ?',
      [id],
    );
    return row ? toVehicleTrip(row) : null;
  }

  async save(trip: VehicleTrip): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      upsertSql('vehicle_trips', VEHICLE_TRIP_COLUMNS),
      fromVehicleTrip(trip),
    );
  }

  async softDelete(id: string): Promise<void> {
    const db = await getDatabase();
    const now = nowTimestamp();
    await db.runAsync(
      `UPDATE vehicle_trips SET deleted_at = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
      [now, now, id],
    );
  }

  async kilometresByVehicle(fy: number): Promise<{ vehicleLabel: string; kilometres: number }[]> {
    const db = await getDatabase();
    // Grouped per vehicle because the 5,000km cap is per car, not per person.
    const rows = await db.getAllAsync<{ vehicle_label: string; kilometres: number }>(
      `SELECT vehicle_label, SUM(kilometres) AS kilometres
       FROM vehicle_trips
       WHERE financial_year = ? AND deleted_at IS NULL
       GROUP BY vehicle_label
       ORDER BY kilometres DESC`,
      [fy],
    );
    return rows.map((row) => ({ vehicleLabel: row.vehicle_label, kilometres: row.kilometres }));
  }

  async vehicleLabels(): Promise<string[]> {
    const db = await getDatabase();
    // Across every year, not just the current one: the same car is normally
    // driven year after year, and the point is to stop the user retyping a label
    // that must match exactly to share a cap.
    const rows = await db.getAllAsync<{ vehicle_label: string }>(
      `SELECT vehicle_label
       FROM vehicle_trips
       WHERE deleted_at IS NULL
       GROUP BY vehicle_label
       ORDER BY MAX(created_at) DESC`,
    );
    return rows.map((row) => row.vehicle_label);
  }

  async financialYearsWithTrips(): Promise<number[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ financial_year: number }>(
      `SELECT DISTINCT financial_year
       FROM vehicle_trips
       WHERE deleted_at IS NULL
       ORDER BY financial_year DESC`,
    );
    return rows.map((row) => row.financial_year);
  }
}

export const receiptRepository: ReceiptRepository = new SqliteReceiptRepository();
export const wfhLogRepository: WfhLogRepository = new SqliteWfhLogRepository();
export const vehicleTripRepository: VehicleTripRepository = new SqliteVehicleTripRepository();
