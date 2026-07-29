/**
 * Database schema and migrations.
 *
 * Migrations are an append-only list. Each entry runs once, in order, and the
 * applied count is tracked in SQLite's `user_version` pragma. **Never edit or
 * reorder an existing migration** — a device that already ran it won't re-run
 * it, so an edit silently produces two different schemas in the wild. Add a
 * new entry instead.
 *
 * @see PHASE_1_PLAN.md §4
 */

/**
 * The five columns every syncable table carries.
 *
 * Present from day one even though nothing reads them until Firebase lands in
 * milestone 8. Adding `updated_at` and tombstones to a table already full of
 * user receipts is a real migration; including them now costs nothing.
 */
const SYNC_COLUMNS = `
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  server_id     TEXT,
  sync_state    TEXT NOT NULL DEFAULT 'pending'
`;

export const MIGRATIONS: readonly string[] = [
  // 1 — initial schema
  `
  CREATE TABLE receipts (
    id                       TEXT PRIMARY KEY NOT NULL,
    merchant                 TEXT NOT NULL,
    amount_cents             INTEGER NOT NULL,
    gst_cents                INTEGER,
    purchase_date            TEXT NOT NULL,
    financial_year           INTEGER NOT NULL,
    category_id              TEXT NOT NULL,
    work_use_percent         INTEGER NOT NULL DEFAULT 100,
    notes                    TEXT,
    photo_uri                TEXT,
    substantiation_exemption TEXT,
    ${SYNC_COLUMNS}
  );

  CREATE INDEX idx_receipts_fy ON receipts (financial_year, deleted_at);
  CREATE INDEX idx_receipts_category ON receipts (category_id);

  CREATE TABLE wfh_logs (
    id             TEXT PRIMARY KEY NOT NULL,
    log_date       TEXT NOT NULL,
    financial_year INTEGER NOT NULL,
    hours          REAL NOT NULL,
    notes          TEXT,
    ${SYNC_COLUMNS}
  );

  CREATE INDEX idx_wfh_logs_fy ON wfh_logs (financial_year, deleted_at);

  CREATE TABLE vehicle_trips (
    id             TEXT PRIMARY KEY NOT NULL,
    trip_date      TEXT NOT NULL,
    financial_year INTEGER NOT NULL,
    kilometres     REAL NOT NULL,
    purpose        TEXT NOT NULL,
    vehicle_label  TEXT NOT NULL,
    ${SYNC_COLUMNS}
  );

  CREATE INDEX idx_vehicle_trips_fy ON vehicle_trips (financial_year, deleted_at);
  CREATE INDEX idx_vehicle_trips_vehicle ON vehicle_trips (vehicle_label);

  -- Seeded from @/domain/categories on open. Mirrored into the database so
  -- category totals can be computed in SQL, and so a receipt whose category
  -- was removed from a later build still resolves to a name.
  CREATE TABLE categories (
    id                          TEXT PRIMARY KEY NOT NULL,
    name                        TEXT NOT NULL,
    mytax_label                 TEXT NOT NULL,
    counts_toward_substantiation INTEGER NOT NULL,
    entry_kind                  TEXT NOT NULL,
    phase                       INTEGER NOT NULL,
    sort_order                  INTEGER NOT NULL
  );
  `,
];

/** Schema version the code expects. Equals the number of migrations. */
export const SCHEMA_VERSION = MIGRATIONS.length;

export const DATABASE_NAME = 'taxtrack.db';
