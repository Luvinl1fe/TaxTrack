import { RECEIPT_COLUMNS, VEHICLE_TRIP_COLUMNS, WFH_LOG_COLUMNS } from '@/db/mappers';
import { MIGRATIONS, SCHEMA_VERSION } from '@/db/schema';

const ALL_SQL = MIGRATIONS.join('\n');

/** Column names declared for a table in the migration SQL. */
function declaredColumns(table: string): string[] {
  const match = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n  \\);`).exec(ALL_SQL);
  if (match === null) throw new Error(`No CREATE TABLE found for ${table}`);

  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'))
    .map((line) => line.split(/\s+/)[0].replace(/,$/, ''))
    .filter((name) => name.length > 0);
}

describe('schema version', () => {
  it('tracks the migration count', () => {
    expect(SCHEMA_VERSION).toBe(MIGRATIONS.length);
  });

  it('has at least one migration', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
  });
});

describe('column lists match the DDL', () => {
  // fromX() binds positionally, so a column present in one place and not the
  // other writes values into the wrong columns — silently, and only on device.
  it.each([
    ['receipts', RECEIPT_COLUMNS],
    ['wfh_logs', WFH_LOG_COLUMNS],
    ['vehicle_trips', VEHICLE_TRIP_COLUMNS],
  ])('%s', (table, columns) => {
    expect([...columns].sort()).toEqual(declaredColumns(table).sort());
  });
});

describe('sync columns', () => {
  it.each(['receipts', 'wfh_logs', 'vehicle_trips'])(
    '%s carries all five sync columns from day one',
    (table) => {
      const columns = declaredColumns(table);
      for (const column of ['created_at', 'updated_at', 'deleted_at', 'server_id', 'sync_state']) {
        expect(columns).toContain(column);
      }
    },
  );
});

describe('indexes', () => {
  it.each(['receipts', 'wfh_logs', 'vehicle_trips'])(
    '%s is indexed on financial_year, the primary filter',
    (table) => {
      expect(ALL_SQL).toMatch(new RegExp(`CREATE INDEX \\w+ ON ${table} \\(financial_year`));
    },
  );
});

describe('money columns', () => {
  it('stores amounts as INTEGER cents, never REAL', () => {
    expect(ALL_SQL).toMatch(/amount_cents\s+INTEGER NOT NULL/);
    expect(ALL_SQL).toMatch(/gst_cents\s+INTEGER/);
    expect(ALL_SQL).not.toMatch(/amount_cents\s+REAL/);
  });
});
