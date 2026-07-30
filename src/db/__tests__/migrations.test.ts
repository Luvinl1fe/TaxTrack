/**
 * The migration runner and category seeding, executed against real SQLite.
 *
 * `schema.test.ts` checks the DDL as *text*. These tests check that SQLite
 * accepts it: a typo in a column constraint or an index passes a regex happily
 * and fails on the first launch of a real device.
 */

import { migrate, seedCategories } from '@/db/database';
import type { SqliteDatabase } from '@/db/driver';
import { MIGRATIONS, SCHEMA_VERSION } from '@/db/schema';
import { CATEGORIES } from '@/domain/categories';
import { createTestDatabase } from '../../../test-support/sqliteTestDatabase';

// expo-sqlite is a native module and won't load in Node. Nothing here calls it
// — the database is injected — but database.ts imports it at module scope.
// Babel hoists this above the imports above, so the stub is in place in time.
jest.mock('expo-sqlite', () => ({}));

async function userVersion(db: SqliteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? -1;
}

async function objectNames(db: SqliteDatabase, type: 'table' | 'index'): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    [type],
  );
  return rows.map((row) => row.name);
}

describe('migrate', () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('applies every migration to a fresh database', async () => {
    expect(await userVersion(db)).toBe(0);

    await migrate(db);

    expect(await userVersion(db)).toBe(SCHEMA_VERSION);
  });

  it('creates every table the app reads', async () => {
    await migrate(db);

    expect(await objectNames(db, 'table')).toEqual([
      'categories',
      'receipts',
      'vehicle_trips',
      'wfh_logs',
    ]);
  });

  it('creates the declared indexes', async () => {
    await migrate(db);

    // The queries filter on financial_year and deleted_at on every screen. An
    // index that failed to apply is invisible until the table is large.
    expect(await objectNames(db, 'index')).toEqual([
      'idx_receipts_category',
      'idx_receipts_fy',
      'idx_vehicle_trips_fy',
      'idx_vehicle_trips_vehicle',
      'idx_wfh_logs_fy',
    ]);
  });

  it('is a no-op the second time', async () => {
    await migrate(db);
    // Would throw "table receipts already exists" if user_version were ignored.
    await expect(migrate(db)).resolves.toBeUndefined();

    expect(await userVersion(db)).toBe(SCHEMA_VERSION);
  });

  it('refuses to run against a database from a newer build', async () => {
    await db.execAsync(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);

    // A downgrade is the dangerous case: the newer schema may hold columns this
    // build would silently drop from every write.
    await expect(migrate(db)).rejects.toThrow(/downgraded/);
  });

  it('leaves user_version untouched when a migration fails', async () => {
    // A half-applied migration is the worst outcome — the next launch would
    // skip the remainder. The runner wraps each in a transaction to prevent it.
    // The same database with only execAsync sabotaged, so the transaction and
    // the version pragma are the real ones.
    const broken: SqliteDatabase = Object.create(db);
    broken.execAsync = async (source: string) => {
      if (source.includes('CREATE TABLE')) throw new Error('disk full');
      return db.execAsync(source);
    };

    await expect(migrate(broken)).rejects.toThrow('disk full');

    expect(await userVersion(db)).toBe(0);
    expect(await objectNames(db, 'table')).toEqual([]);
  });
});

describe('seedCategories', () => {
  let db: SqliteDatabase;

  beforeEach(async () => {
    db = createTestDatabase();
    await migrate(db);
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('mirrors the category list in list order', async () => {
    await seedCategories(db);

    const rows = await db.getAllAsync<{ id: string; name: string; sort_order: number }>(
      'SELECT id, name, sort_order FROM categories ORDER BY sort_order',
    );

    expect(rows.map((row) => row.id)).toEqual(CATEGORIES.map((category) => category.id));
    expect(rows.map((row) => row.sort_order)).toEqual(CATEGORIES.map((_, index) => index));
  });

  it('stores the substantiation flag as an integer, not a boolean', async () => {
    await seedCategories(db);

    // SQLite has no boolean. Binding `true` would store 1 anyway, but reading it
    // back as a boolean is the kind of assumption that breaks a SQL filter.
    const rows = await db.getAllAsync<{ counts_toward_substantiation: unknown }>(
      'SELECT counts_toward_substantiation FROM categories',
    );

    for (const row of rows) {
      expect([0, 1]).toContain(row.counts_toward_substantiation);
    }
  });

  it('runs on every launch without duplicating rows', async () => {
    await seedCategories(db);
    await seedCategories(db);

    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM categories',
    );
    expect(row?.count).toBe(CATEGORIES.length);
  });

  it('refreshes a name a later build changed', async () => {
    await db.runAsync(
      `INSERT INTO categories
         (id, name, mytax_label, counts_toward_substantiation, entry_kind, phase, sort_order)
       VALUES ('stationery', 'Stale name', 'D5', 1, 'receipt', 1, 99)`,
    );

    await seedCategories(db);

    const row = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM categories WHERE id = 'stationery'`,
    );
    expect(row?.name).toBe(CATEGORIES.find((category) => category.id === 'stationery')?.name);
  });

  it('keeps a category a later build dropped', async () => {
    // Deliberate: a receipt filed under a retired category must still resolve to
    // a name rather than showing the user a bare id.
    await db.runAsync(
      `INSERT INTO categories
         (id, name, mytax_label, counts_toward_substantiation, entry_kind, phase, sort_order)
       VALUES ('retired', 'Retired category', 'D10', 1, 'receipt', 1, 99)`,
    );

    await seedCategories(db);

    const row = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM categories WHERE id = 'retired'`,
    );
    expect(row?.name).toBe('Retired category');
  });
});
