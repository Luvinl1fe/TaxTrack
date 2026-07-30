/**
 * The WFH log and vehicle trip repositories, executed against real SQLite.
 *
 * These had never run at all — not in a test, not on a device (`KNOWN_GAPS.md`,
 * milestone 3). The screens that use them arrive in milestone 6; this at least
 * proves the SQL parses and the columns line up before then.
 */

import { migrate, seedCategories, setDatabaseForTests } from '@/db/database';
import type { SqliteDatabase } from '@/db/driver';
import { vehicleTripRepository, wfhLogRepository } from '@/db/receiptRepository';
import { createVehicleTrip, createWfhLog } from '@/domain/factories';
import { financialYearOptions } from '@/domain/receiptList';
import { calculateVehicleClaim } from '@/domain/vehicleCalculator';
import type { VehicleTrip, WfhLog } from '@/domain/types';
import { createTestDatabase } from '../../../test-support/sqliteTestDatabase';

// Native modules that don't load in Node; neither is called here. Babel hoists
// these above the imports above.
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'not-used-in-these-tests' }));

const FY = 2025;

let db: SqliteDatabase;

beforeEach(async () => {
  db = createTestDatabase();
  await migrate(db);
  await seedCategories(db);
  setDatabaseForTests(db);
});

afterEach(async () => {
  setDatabaseForTests(null);
  await db.closeAsync();
});

describe('wfhLogRepository', () => {
  const log = (id: string, date: string, hours: number, notes?: string): WfhLog =>
    createWfhLog({ id, date, hours, notes, now: '2025-08-15T02:30:00.000Z' });

  it('round-trips every field', async () => {
    const original = log('w1', '2025-08-15', 7.6, 'Worked from the spare room');

    await wfhLogRepository.save(original);

    expect(await wfhLogRepository.get('w1')).toEqual(original);
  });

  it('round-trips a log with no notes', async () => {
    const original = log('w2', '2025-08-15', 8);

    await wfhLogRepository.save(original);

    const loaded = await wfhLogRepository.get('w2');
    expect(loaded).toEqual(original);
    expect(loaded?.notes).toBeNull();
  });

  it('preserves fractional hours', async () => {
    // hours is REAL, not INTEGER — a half day has to survive the round trip.
    await wfhLogRepository.save(log('w3', '2025-08-15', 3.5));

    expect((await wfhLogRepository.get('w3'))?.hours).toBe(3.5);
  });

  it('returns null for an id that does not exist', async () => {
    expect(await wfhLogRepository.get('nope')).toBeNull();
  });

  it('updates in place rather than inserting a second row', async () => {
    await wfhLogRepository.save(log('w1', '2025-08-15', 4));
    await wfhLogRepository.save(log('w1', '2025-08-15', 8));

    const all = await wfhLogRepository.list(FY);
    expect(all).toHaveLength(1);
    expect(all[0].hours).toBe(8);
  });

  it('lists newest first, within the financial year only', async () => {
    await wfhLogRepository.save(log('aug', '2025-08-15', 8));
    await wfhLogRepository.save(log('dec', '2025-12-01', 8));
    await wfhLogRepository.save(log('last-fy', '2025-06-30', 8));

    expect((await wfhLogRepository.list(FY)).map((l) => l.id)).toEqual(['dec', 'aug']);
  });

  it('hides soft-deleted logs', async () => {
    await wfhLogRepository.save(log('kept', '2025-08-15', 8));
    await wfhLogRepository.save(log('binned', '2025-08-16', 8));

    await wfhLogRepository.softDelete('binned');

    expect((await wfhLogRepository.list(FY)).map((l) => l.id)).toEqual(['kept']);
    // Tombstoned, not gone, same as receipts.
    expect((await wfhLogRepository.get('binned'))?.deletedAt).not.toBeNull();
  });

  describe('totalHours', () => {
    it('adds up the year', async () => {
      await wfhLogRepository.save(log('a', '2025-08-15', 7.5));
      await wfhLogRepository.save(log('b', '2025-08-16', 8));
      await wfhLogRepository.save(log('c', '2025-08-17', 4.25));

      expect(await wfhLogRepository.totalHours(FY)).toBeCloseTo(19.75, 10);
    });

    it('returns 0 rather than null for a year with no logs', async () => {
      // SUM() over no rows is NULL in SQL. Reaching the WFH calculator as null
      // would produce a NaN deduction.
      expect(await wfhLogRepository.totalHours(FY)).toBe(0);
    });

    it('excludes soft-deleted logs and other years', async () => {
      await wfhLogRepository.save(log('kept', '2025-08-15', 8));
      await wfhLogRepository.save(log('binned', '2025-08-16', 8));
      await wfhLogRepository.save(log('last-fy', '2025-06-30', 8));
      await wfhLogRepository.softDelete('binned');

      expect(await wfhLogRepository.totalHours(FY)).toBe(8);
    });
  });
});

describe('vehicleTripRepository', () => {
  const trip = (
    id: string,
    date: string,
    kilometres: number,
    vehicleLabel = 'Hilux',
  ): VehicleTrip =>
    createVehicleTrip({
      id,
      date,
      kilometres,
      purpose: 'Site visit — Fremantle',
      vehicleLabel,
      now: '2025-08-15T02:30:00.000Z',
    });

  it('round-trips every field', async () => {
    const original = trip('t1', '2025-08-15', 42.5);

    await vehicleTripRepository.save(original);

    expect(await vehicleTripRepository.get('t1')).toEqual(original);
  });

  it('returns null for an id that does not exist', async () => {
    expect(await vehicleTripRepository.get('nope')).toBeNull();
  });

  it('updates in place rather than inserting a second row', async () => {
    await vehicleTripRepository.save(trip('t1', '2025-08-15', 10));
    await vehicleTripRepository.save(trip('t1', '2025-08-15', 25));

    const all = await vehicleTripRepository.list(FY);
    expect(all).toHaveLength(1);
    expect(all[0].kilometres).toBe(25);
  });

  it('lists newest first, within the financial year only', async () => {
    await vehicleTripRepository.save(trip('aug', '2025-08-15', 10));
    await vehicleTripRepository.save(trip('dec', '2025-12-01', 10));
    await vehicleTripRepository.save(trip('last-fy', '2025-06-30', 10));

    expect((await vehicleTripRepository.list(FY)).map((t) => t.id)).toEqual(['dec', 'aug']);
  });

  it('hides soft-deleted trips', async () => {
    await vehicleTripRepository.save(trip('kept', '2025-08-15', 10));
    await vehicleTripRepository.save(trip('binned', '2025-08-16', 10));

    await vehicleTripRepository.softDelete('binned');

    expect((await vehicleTripRepository.list(FY)).map((t) => t.id)).toEqual(['kept']);
    expect((await vehicleTripRepository.get('binned'))?.deletedAt).not.toBeNull();
  });

  describe('kilometresByVehicle', () => {
    it('groups per vehicle, furthest first', async () => {
      // The 5,000km cap is per car, so a combined total would overstate the
      // claim for someone who used two vehicles.
      await vehicleTripRepository.save(trip('a', '2025-08-15', 120, 'Hilux'));
      await vehicleTripRepository.save(trip('b', '2025-08-16', 80.5, 'Hilux'));
      await vehicleTripRepository.save(trip('c', '2025-08-17', 300, 'Corolla'));

      expect(await vehicleTripRepository.kilometresByVehicle(FY)).toEqual([
        { vehicleLabel: 'Corolla', kilometres: 300 },
        { vehicleLabel: 'Hilux', kilometres: 200.5 },
      ]);
    });

    it('treats labels as distinct vehicles exactly as typed', async () => {
      // Free-text labels: 'Hilux' and 'hilux' are two cars as far as SQL is
      // concerned, and each gets its own 5,000km cap. Worth knowing before the
      // milestone 6 UI lets people type one.
      await vehicleTripRepository.save(trip('a', '2025-08-15', 100, 'Hilux'));
      await vehicleTripRepository.save(trip('b', '2025-08-16', 100, 'hilux'));

      expect(await vehicleTripRepository.kilometresByVehicle(FY)).toHaveLength(2);
    });

    it('returns an empty list for a year with no trips', async () => {
      expect(await vehicleTripRepository.kilometresByVehicle(FY)).toEqual([]);
    });

    it('excludes soft-deleted trips and other years', async () => {
      await vehicleTripRepository.save(trip('kept', '2025-08-15', 100));
      await vehicleTripRepository.save(trip('binned', '2025-08-16', 100));
      await vehicleTripRepository.save(trip('last-fy', '2025-06-30', 100));
      await vehicleTripRepository.softDelete('binned');

      expect(await vehicleTripRepository.kilometresByVehicle(FY)).toEqual([
        { vehicleLabel: 'Hilux', kilometres: 100 },
      ]);
    });

    it('agrees with the calculator, which groups the same trips in TypeScript', async () => {
      // Same reasoning as the dashboard/list agreement in milestone 5: two code
      // paths group the same rows, and a screen showing both must not be able to
      // contradict itself.
      await vehicleTripRepository.save(trip('a', '2025-08-15', 120, 'Hilux'));
      await vehicleTripRepository.save(trip('b', '2025-08-16', 80.5, 'Hilux'));
      await vehicleTripRepository.save(trip('c', '2025-08-17', 300, 'Corolla'));

      const fromSql = await vehicleTripRepository.kilometresByVehicle(FY);
      const calculated = calculateVehicleClaim(await vehicleTripRepository.list(FY), FY);

      expect(calculated?.claims.map((claim) => claim.vehicleLabel)).toEqual(
        fromSql.map((row) => row.vehicleLabel),
      );
      for (const [index, claim] of (calculated?.claims ?? []).entries()) {
        expect(claim.kilometres).toBeCloseTo(fromSql[index].kilometres, 10);
      }
    });
  });

  describe('vehicleLabels', () => {
    it('is empty before any trip exists', async () => {
      expect(await vehicleTripRepository.vehicleLabels()).toEqual([]);
    });

    it('lists each car once, most recently used first', async () => {
      await vehicleTripRepository.save({
        ...trip('a', '2025-08-15', 100, 'Corolla'),
        createdAt: '2025-08-15T00:00:00.000Z',
      });
      await vehicleTripRepository.save({
        ...trip('b', '2025-09-01', 100, 'Hilux'),
        createdAt: '2025-09-01T00:00:00.000Z',
      });
      await vehicleTripRepository.save({
        ...trip('c', '2025-09-02', 100, 'Corolla'),
        createdAt: '2025-09-02T00:00:00.000Z',
      });

      expect(await vehicleTripRepository.vehicleLabels()).toEqual(['Corolla', 'Hilux']);
    });

    it('spans financial years, because the same car is driven every year', async () => {
      await vehicleTripRepository.save(trip('old', '2023-09-01', 100, 'Old faithful'));

      expect(await vehicleTripRepository.vehicleLabels()).toEqual(['Old faithful']);
    });

    it('reaches a year that has trips but no receipts', async () => {
      // The year selector unions receipt years with these. Without trip years, a
      // year spent logging only mileage would be unreachable in the picker.
      await vehicleTripRepository.save(trip('a', '2023-09-01', 100));
      await vehicleTripRepository.save(trip('b', '2025-08-15', 100));

      const years = await vehicleTripRepository.financialYearsWithTrips();

      expect(years).toEqual([2025, 2023]);
      expect(financialYearOptions(years, 2026)).toEqual([2026, 2025, 2023]);
    });

    it('drops a year once its only trip is deleted', async () => {
      await vehicleTripRepository.save(trip('kept', '2025-08-15', 100));
      await vehicleTripRepository.save(trip('binned', '2023-09-01', 100));
      await vehicleTripRepository.softDelete('binned');

      expect(await vehicleTripRepository.financialYearsWithTrips()).toEqual([2025]);
    });

    it('forgets a car whose only trip was deleted', async () => {
      await vehicleTripRepository.save(trip('a', '2025-08-15', 100, 'Hilux'));
      await vehicleTripRepository.save(trip('b', '2025-08-16', 100, 'Mistake'));
      await vehicleTripRepository.softDelete('b');

      expect(await vehicleTripRepository.vehicleLabels()).toEqual(['Hilux']);
    });
  });
});
