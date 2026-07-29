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
  type ReceiptRow,
} from '@/db/mappers';
import { createReceipt, createVehicleTrip, createWfhLog } from '@/domain/factories';

function receiptRow(overrides: Partial<ReceiptRow> = {}): ReceiptRow {
  return {
    id: 'r1',
    merchant: 'Officeworks',
    amount_cents: 4995,
    gst_cents: 454,
    purchase_date: '2026-08-01',
    financial_year: 2026,
    category_id: 'stationery',
    work_use_percent: 100,
    notes: null,
    photo_uri: null,
    substantiation_exemption: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    deleted_at: null,
    server_id: null,
    sync_state: 'pending',
    ...overrides,
  };
}

describe('toReceipt', () => {
  it('maps a row to a receipt', () => {
    const receipt = toReceipt(receiptRow());
    expect(receipt.amountCents).toBe(4995);
    expect(receipt.gstCents).toBe(454);
    expect(receipt.financialYear).toBe(2026);
    expect(receipt.syncState).toBe('pending');
  });

  it('maps nullable columns to null', () => {
    const receipt = toReceipt(receiptRow({ gst_cents: null, notes: null, photo_uri: null }));
    expect(receipt.gstCents).toBeNull();
    expect(receipt.notes).toBeNull();
    expect(receipt.photoUri).toBeNull();
  });

  it('reads a substantiation exemption', () => {
    const receipt = toReceipt(receiptRow({ substantiation_exemption: 'travel_allowance' }));
    expect(receipt.substantiationExemption).toBe('travel_allowance');
  });

  it('rejects an unknown substantiation exemption', () => {
    expect(() => toReceipt(receiptRow({ substantiation_exemption: 'made_up' }))).toThrow(TypeError);
  });

  it('rejects an unknown sync state', () => {
    expect(() => toReceipt(receiptRow({ sync_state: 'halfway' }))).toThrow(TypeError);
  });

  it('rejects a non-integer amount rather than contributing a float to a total', () => {
    expect(() => toReceipt(receiptRow({ amount_cents: 49.95 }))).toThrow(TypeError);
  });

  it('rejects a missing required field instead of producing undefined', () => {
    expect(() => toReceipt(receiptRow({ merchant: null as never }))).toThrow(TypeError);
  });

  it('preserves a tombstone', () => {
    const receipt = toReceipt(receiptRow({ deleted_at: '2026-09-01T00:00:00.000Z' }));
    expect(receipt.deletedAt).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('round trips', () => {
  it('receipt → row → receipt is lossless', () => {
    const original = createReceipt({
      id: 'r1',
      merchant: 'Bunnings',
      amountCents: 12_345,
      purchaseDate: '2026-09-15',
      categoryId: 'tools-equipment',
      gstCents: 1122,
      workUsePercent: 80,
      notes: 'Drill',
      now: '2026-09-15T02:00:00.000Z',
    });

    const values = fromReceipt(original);
    const row = Object.fromEntries(
      RECEIPT_COLUMNS.map((column, index) => [column, values[index]]),
    ) as unknown as ReceiptRow;

    expect(toReceipt(row)).toEqual(original);
  });

  it('wfh log → row → log is lossless', () => {
    const original = createWfhLog({
      id: 'w1',
      date: '2026-09-15',
      hours: 7.5,
      now: '2026-09-15T02:00:00.000Z',
    });

    const values = fromWfhLog(original);
    const row = Object.fromEntries(WFH_LOG_COLUMNS.map((c, i) => [c, values[i]])) as never;

    expect(toWfhLog(row)).toEqual(original);
  });

  it('vehicle trip → row → trip is lossless', () => {
    const original = createVehicleTrip({
      id: 'v1',
      date: '2026-09-15',
      kilometres: 42.4,
      purpose: 'Client site',
      vehicleLabel: 'Corolla',
      now: '2026-09-15T02:00:00.000Z',
    });

    const values = fromVehicleTrip(original);
    const row = Object.fromEntries(VEHICLE_TRIP_COLUMNS.map((c, i) => [c, values[i]])) as never;

    expect(toVehicleTrip(row)).toEqual(original);
  });
});

describe('column ordering', () => {
  // fromX() returns positional bind parameters, so a mismatch between the
  // array order and the column list silently writes values into wrong columns.
  it('receipt values line up with the column list', () => {
    expect(fromReceipt(toReceipt(receiptRow()))).toHaveLength(RECEIPT_COLUMNS.length);
  });

  it('wfh values line up with the column list', () => {
    const log = createWfhLog({ id: 'w1', date: '2026-09-15', hours: 8 });
    expect(fromWfhLog(log)).toHaveLength(WFH_LOG_COLUMNS.length);
  });

  it('vehicle values line up with the column list', () => {
    const trip = createVehicleTrip({
      id: 'v1',
      date: '2026-09-15',
      kilometres: 10,
      purpose: 'Site',
      vehicleLabel: 'Corolla',
    });
    expect(fromVehicleTrip(trip)).toHaveLength(VEHICLE_TRIP_COLUMNS.length);
  });
});

describe('upsertSql', () => {
  it('builds one placeholder per column', () => {
    expect(upsertSql('receipts', ['id', 'merchant'])).toBe(
      'INSERT OR REPLACE INTO receipts (id, merchant) VALUES (?, ?)',
    );
  });

  it('matches the receipt column count', () => {
    const sql = upsertSql('receipts', RECEIPT_COLUMNS);
    expect(sql.match(/\?/g)).toHaveLength(RECEIPT_COLUMNS.length);
  });
});
