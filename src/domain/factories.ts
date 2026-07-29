/**
 * Factories for new records.
 *
 * Every record carries five sync fields and a derived `financialYear`. Setting
 * those by hand at each call site is how a receipt ends up with the wrong year
 * or an `updatedAt` that never moves, so construction goes through here.
 */

import { fyStartYear } from '@/lib/financialYear';
import type { Receipt, VehicleTrip, WfhLog } from '@/domain/types';

export interface NewReceiptInput {
  id: string;
  merchant: string;
  amountCents: number;
  purchaseDate: string;
  categoryId: string;
  gstCents?: number | null;
  workUsePercent?: number;
  notes?: string | null;
  photoUri?: string | null;
  substantiationExemption?: Receipt['substantiationExemption'];
  now?: string;
}

export function createReceipt(input: NewReceiptInput): Receipt {
  const timestamp = input.now ?? new Date().toISOString();
  const workUsePercent = input.workUsePercent ?? 100;

  if (!Number.isInteger(input.amountCents)) {
    throw new TypeError('amountCents must be an integer — money is stored as whole cents');
  }
  if (!Number.isInteger(workUsePercent) || workUsePercent < 0 || workUsePercent > 100) {
    throw new RangeError('workUsePercent must be a whole number between 0 and 100');
  }

  return {
    id: input.id,
    merchant: input.merchant,
    amountCents: input.amountCents,
    gstCents: input.gstCents ?? null,
    purchaseDate: input.purchaseDate,
    // Derived, never passed in — the whole point of the FY module.
    financialYear: fyStartYear(input.purchaseDate),
    categoryId: input.categoryId,
    workUsePercent,
    notes: input.notes ?? null,
    photoUri: input.photoUri ?? null,
    substantiationExemption: input.substantiationExemption ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    serverId: null,
    syncState: 'pending',
  };
}

export interface NewWfhLogInput {
  id: string;
  date: string;
  hours: number;
  notes?: string | null;
  now?: string;
}

export function createWfhLog(input: NewWfhLogInput): WfhLog {
  if (!Number.isFinite(input.hours) || input.hours <= 0) {
    throw new RangeError('hours must be a positive number');
  }
  if (input.hours > 24) {
    throw new RangeError('hours cannot exceed 24 in a single day');
  }

  const timestamp = input.now ?? new Date().toISOString();

  return {
    id: input.id,
    date: input.date,
    financialYear: fyStartYear(input.date),
    hours: input.hours,
    notes: input.notes ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    serverId: null,
    syncState: 'pending',
  };
}

export interface NewVehicleTripInput {
  id: string;
  date: string;
  kilometres: number;
  purpose: string;
  vehicleLabel: string;
  now?: string;
}

export function createVehicleTrip(input: NewVehicleTripInput): VehicleTrip {
  if (!Number.isFinite(input.kilometres) || input.kilometres <= 0) {
    throw new RangeError('kilometres must be a positive number');
  }

  const timestamp = input.now ?? new Date().toISOString();

  return {
    id: input.id,
    date: input.date,
    financialYear: fyStartYear(input.date),
    kilometres: input.kilometres,
    purpose: input.purpose,
    vehicleLabel: input.vehicleLabel,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    serverId: null,
    syncState: 'pending',
  };
}
