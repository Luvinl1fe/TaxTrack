/**
 * Row ↔ domain mapping.
 *
 * Kept pure and separate from the repositories so the translation layer — the
 * part most likely to harbour a silent type bug — is unit-testable without a
 * device or a database.
 *
 * SQLite has no boolean and no null-safety, so every read validates rather
 * than casts. A row that can't be mapped throws: a receipt with a corrupt
 * amount should surface loudly, not quietly contribute a `NaN` to a total.
 */

import {
  SUBSTANTIATION_EXEMPTIONS,
  type Receipt,
  type SubstantiationExemption,
  type SyncFields,
  type SyncState,
  type VehicleTrip,
  type WfhLog,
} from '@/domain/types';

/**
 * The value types we ever bind to a statement. Narrower than expo-sqlite's
 * `SQLiteBindValue` (which also allows blobs), and declared locally so the
 * mapping layer stays free of database imports and testable in plain Node.
 */
export type BindValue = string | number | null;

export interface ReceiptRow {
  id: string;
  merchant: string;
  amount_cents: number;
  gst_cents: number | null;
  purchase_date: string;
  financial_year: number;
  category_id: string;
  work_use_percent: number;
  notes: string | null;
  photo_uri: string | null;
  substantiation_exemption: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_id: string | null;
  sync_state: string;
}

export interface WfhLogRow {
  id: string;
  log_date: string;
  financial_year: number;
  hours: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_id: string | null;
  sync_state: string;
}

export interface VehicleTripRow {
  id: string;
  trip_date: string;
  financial_year: number;
  kilometres: number;
  purpose: string;
  vehicle_label: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_id: string | null;
  sync_state: string;
}

function requireInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`Expected ${field} to be an integer, got ${JSON.stringify(value)}`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Expected ${field} to be a finite number, got ${JSON.stringify(value)}`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected ${field} to be a string, got ${JSON.stringify(value)}`);
  }
  return value;
}

function optionalInteger(value: unknown, field: string): number | null {
  return value === null || value === undefined ? null : requireInteger(value, field);
}

function optionalString(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : requireString(value, field);
}

function toSyncState(value: unknown): SyncState {
  if (value === 'pending' || value === 'synced') return value;
  throw new TypeError(`Unknown sync_state ${JSON.stringify(value)}`);
}

function toSubstantiationExemption(value: unknown): SubstantiationExemption | null {
  if (value === null || value === undefined) return null;
  if (SUBSTANTIATION_EXEMPTIONS.includes(value as SubstantiationExemption)) {
    return value as SubstantiationExemption;
  }
  throw new TypeError(`Unknown substantiation_exemption ${JSON.stringify(value)}`);
}

function toSyncFields(row: {
  created_at: unknown;
  updated_at: unknown;
  deleted_at: unknown;
  server_id: unknown;
  sync_state: unknown;
}): SyncFields {
  return {
    createdAt: requireString(row.created_at, 'created_at'),
    updatedAt: requireString(row.updated_at, 'updated_at'),
    deletedAt: optionalString(row.deleted_at, 'deleted_at'),
    serverId: optionalString(row.server_id, 'server_id'),
    syncState: toSyncState(row.sync_state),
  };
}

export function toReceipt(row: ReceiptRow): Receipt {
  return {
    id: requireString(row.id, 'id'),
    merchant: requireString(row.merchant, 'merchant'),
    amountCents: requireInteger(row.amount_cents, 'amount_cents'),
    gstCents: optionalInteger(row.gst_cents, 'gst_cents'),
    purchaseDate: requireString(row.purchase_date, 'purchase_date'),
    financialYear: requireInteger(row.financial_year, 'financial_year'),
    categoryId: requireString(row.category_id, 'category_id'),
    workUsePercent: requireInteger(row.work_use_percent, 'work_use_percent'),
    notes: optionalString(row.notes, 'notes'),
    photoUri: optionalString(row.photo_uri, 'photo_uri'),
    substantiationExemption: toSubstantiationExemption(row.substantiation_exemption),
    ...toSyncFields(row),
  };
}

/** Ordered to match `RECEIPT_COLUMNS`; used as positional bind parameters. */
export function fromReceipt(receipt: Receipt): BindValue[] {
  return [
    receipt.id,
    receipt.merchant,
    receipt.amountCents,
    receipt.gstCents,
    receipt.purchaseDate,
    receipt.financialYear,
    receipt.categoryId,
    receipt.workUsePercent,
    receipt.notes,
    receipt.photoUri,
    receipt.substantiationExemption,
    receipt.createdAt,
    receipt.updatedAt,
    receipt.deletedAt,
    receipt.serverId,
    receipt.syncState,
  ];
}

export const RECEIPT_COLUMNS = [
  'id',
  'merchant',
  'amount_cents',
  'gst_cents',
  'purchase_date',
  'financial_year',
  'category_id',
  'work_use_percent',
  'notes',
  'photo_uri',
  'substantiation_exemption',
  'created_at',
  'updated_at',
  'deleted_at',
  'server_id',
  'sync_state',
] as const;

export function toWfhLog(row: WfhLogRow): WfhLog {
  return {
    id: requireString(row.id, 'id'),
    date: requireString(row.log_date, 'log_date'),
    financialYear: requireInteger(row.financial_year, 'financial_year'),
    hours: requireNumber(row.hours, 'hours'),
    notes: optionalString(row.notes, 'notes'),
    ...toSyncFields(row),
  };
}

export function fromWfhLog(log: WfhLog): BindValue[] {
  return [
    log.id,
    log.date,
    log.financialYear,
    log.hours,
    log.notes,
    log.createdAt,
    log.updatedAt,
    log.deletedAt,
    log.serverId,
    log.syncState,
  ];
}

export const WFH_LOG_COLUMNS = [
  'id',
  'log_date',
  'financial_year',
  'hours',
  'notes',
  'created_at',
  'updated_at',
  'deleted_at',
  'server_id',
  'sync_state',
] as const;

export function toVehicleTrip(row: VehicleTripRow): VehicleTrip {
  return {
    id: requireString(row.id, 'id'),
    date: requireString(row.trip_date, 'trip_date'),
    financialYear: requireInteger(row.financial_year, 'financial_year'),
    kilometres: requireNumber(row.kilometres, 'kilometres'),
    purpose: requireString(row.purpose, 'purpose'),
    vehicleLabel: requireString(row.vehicle_label, 'vehicle_label'),
    ...toSyncFields(row),
  };
}

export function fromVehicleTrip(trip: VehicleTrip): BindValue[] {
  return [
    trip.id,
    trip.date,
    trip.financialYear,
    trip.kilometres,
    trip.purpose,
    trip.vehicleLabel,
    trip.createdAt,
    trip.updatedAt,
    trip.deletedAt,
    trip.serverId,
    trip.syncState,
  ];
}

export const VEHICLE_TRIP_COLUMNS = [
  'id',
  'trip_date',
  'financial_year',
  'kilometres',
  'purpose',
  'vehicle_label',
  'created_at',
  'updated_at',
  'deleted_at',
  'server_id',
  'sync_state',
] as const;

/** `INSERT OR REPLACE` statement for a table, with positional placeholders. */
export function upsertSql(table: string, columns: readonly string[]): string {
  const placeholders = columns.map(() => '?').join(', ');
  return `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
}
