/**
 * Database lifecycle: open, migrate, seed.
 *
 * Everything else in the app goes through a repository; this is the only
 * module that opens a connection.
 */

import * as SQLite from 'expo-sqlite';

import { CATEGORIES } from '@/domain/categories';
import { DATABASE_NAME, MIGRATIONS } from '@/db/schema';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * The shared database handle.
 *
 * Memoised on the promise, not the resolved value, so concurrent callers
 * during startup await one open rather than racing several.
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= openAndPrepare();
  return databasePromise;
}

async function openAndPrepare(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // WAL improves concurrent read/write behaviour; foreign keys are off by
  // default in SQLite and have to be enabled per connection.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  await migrate(db);
  await seedCategories(db);

  return db;
}

/**
 * Apply any migrations this database hasn't seen.
 *
 * `user_version` holds the count already applied, so a fresh install runs all
 * of them and an existing install runs only the tail.
 */
export async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const applied = row?.user_version ?? 0;

  if (applied > MIGRATIONS.length) {
    throw new Error(
      `Database is at version ${applied} but this build only knows ${MIGRATIONS.length}. ` +
        'This usually means the app was downgraded.',
    );
  }

  for (let version = applied; version < MIGRATIONS.length; version += 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
    });
    // Pragmas can't take bind parameters, and `version` is a loop counter over
    // a module-local array, so interpolation here is not user input.
    await db.execAsync(`PRAGMA user_version = ${version + 1}`);
  }
}

/**
 * Mirror the category list into the database.
 *
 * Idempotent, and safe to re-run on every launch: `INSERT OR REPLACE` refreshes
 * names and flags when a build changes them, while leaving rows for categories
 * a later build dropped — so an old receipt still resolves to a name rather
 * than showing a bare id.
 */
export async function seedCategories(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const [index, category] of CATEGORIES.entries()) {
      await db.runAsync(
        `INSERT OR REPLACE INTO categories
           (id, name, mytax_label, counts_toward_substantiation, entry_kind, phase, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          category.id,
          category.name,
          category.myTaxLabel,
          category.countsTowardSubstantiationThreshold ? 1 : 0,
          category.entryKind,
          category.phase,
          index,
        ],
      );
    }
  });
}

/**
 * Close and forget the handle. Tests and the dev screen's reset use this;
 * the app itself never needs to.
 */
export async function closeDatabase(): Promise<void> {
  if (databasePromise === null) return;
  const db = await databasePromise;
  databasePromise = null;
  await db.closeAsync();
}
