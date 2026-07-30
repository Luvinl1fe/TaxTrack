/**
 * An in-memory SQLite database that satisfies the app's `SqliteDatabase`
 * interface, backed by `better-sqlite3`.
 *
 * This is what lets the real `MIGRATIONS` DDL and the real repository queries
 * run in Jest. `expo-sqlite` is a native module and won't load in Node, so
 * without this the SQL could only ever be checked by hand on a device.
 *
 * Lives outside `src/` deliberately: `better-sqlite3` is a Node native addon
 * and must never be reachable from anything Metro bundles.
 *
 * The adapter is thin on purpose. It translates calling conventions and nothing
 * else — no query rewriting — because the whole value of these tests is that the
 * statements executed here are byte-for-byte the ones that run on the phone.
 */

import Database from 'better-sqlite3';

import type { RunResult, SqliteDatabase } from '@/db/driver';
import type { BindValue } from '@/db/mappers';

class BetterSqliteAdapter implements SqliteDatabase {
  constructor(private readonly db: Database.Database) {}

  async execAsync(source: string): Promise<void> {
    this.db.exec(source);
  }

  async runAsync(source: string, params: BindValue[] = []): Promise<RunResult> {
    const info = this.db.prepare(source).run(...params);
    return {
      changes: info.changes,
      // better-sqlite3 widens to bigint past 2^31; the app's ids are TEXT so
      // this value is never used, but it must still match the declared type.
      lastInsertRowId: Number(info.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(source: string, params: BindValue[] = []): Promise<T | null> {
    // `?? null` because better-sqlite3 returns undefined for no rows, and the
    // callers test `row ? ... : null`.
    return (this.db.prepare(source).get(...params) as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, params: BindValue[] = []): Promise<T[]> {
    return this.db.prepare(source).all(...params) as T[];
  }

  /**
   * `BEGIN`/`COMMIT` by hand rather than better-sqlite3's `db.transaction()`,
   * which rejects async work: it can't know when a promise settles, so it would
   * commit before the task's statements had run. Matches the non-exclusive
   * transaction `expo-sqlite`'s `withTransactionAsync` opens.
   */
  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN');
    try {
      await task();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async closeAsync(): Promise<void> {
    this.db.close();
  }
}

/**
 * A fresh, empty in-memory database. No tables — callers run `migrate()` so the
 * migration runner is itself under test.
 */
export function createTestDatabase(): SqliteDatabase {
  const db = new Database(':memory:');
  // Mirrors openAndPrepare(). WAL is meaningless for :memory: and is skipped;
  // foreign keys are off per connection by default in both drivers.
  db.pragma('foreign_keys = ON');
  return new BetterSqliteAdapter(db);
}
