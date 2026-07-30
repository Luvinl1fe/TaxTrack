/**
 * The database surface the data layer depends on.
 *
 * A deliberately small subset of `expo-sqlite`'s `SQLiteDatabase` — the six
 * methods the repositories and migration runner actually call. `expo-sqlite`
 * satisfies it structurally, so production code is unaffected.
 *
 * It exists so the real SQL can be executed off-device. `expo-sqlite` is a
 * native module and won't load in Jest's Node environment, which is why the
 * migrations and the aggregate queries went untested through milestones 3 and 4
 * (see `KNOWN_GAPS.md`). Tests supply an adapter over `better-sqlite3` instead,
 * running the same statements against in-memory SQLite.
 *
 * Nothing in the app should widen this interface to reach a driver-specific
 * feature — that reintroduces the coupling this removes.
 */

import type { BindValue } from '@/db/mappers';

export interface RunResult {
  lastInsertRowId: number;
  changes: number;
}

/**
 * Each read and write is declared twice, with and without bind parameters,
 * rather than once with an optional array. `expo-sqlite` overloads these the
 * same way — its array form requires the argument — and a single `params?`
 * signature is not assignable to it.
 */
export interface SqliteDatabase {
  /** Run one or more statements. No parameter binding, so no user input. */
  execAsync(source: string): Promise<void>;

  runAsync(source: string): Promise<RunResult>;
  runAsync(source: string, params: BindValue[]): Promise<RunResult>;

  getFirstAsync<T>(source: string): Promise<T | null>;
  getFirstAsync<T>(source: string, params: BindValue[]): Promise<T | null>;

  getAllAsync<T>(source: string): Promise<T[]>;
  getAllAsync<T>(source: string, params: BindValue[]): Promise<T[]>;

  /** Commits on return, rolls back if `task` throws. */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}
