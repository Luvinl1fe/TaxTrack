import { createReceipt, createVehicleTrip, createWfhLog } from '@/domain/factories';

describe('createReceipt', () => {
  const base = {
    id: 'r1',
    merchant: 'Officeworks',
    amountCents: 4995,
    purchaseDate: '2026-08-01',
    categoryId: 'stationery',
  };

  it('derives the financial year from the purchase date', () => {
    expect(createReceipt(base).financialYear).toBe(2026);
  });

  it('derives the previous financial year for a 30 June purchase', () => {
    expect(createReceipt({ ...base, purchaseDate: '2026-06-30' }).financialYear).toBe(2025);
  });

  it('defaults work use to 100 percent', () => {
    expect(createReceipt(base).workUsePercent).toBe(100);
  });

  it('starts unsynced with no tombstone', () => {
    const receipt = createReceipt(base);
    expect(receipt.syncState).toBe('pending');
    expect(receipt.deletedAt).toBeNull();
    expect(receipt.serverId).toBeNull();
  });

  it('sets createdAt and updatedAt to the same instant', () => {
    const receipt = createReceipt({ ...base, now: '2026-08-01T03:00:00.000Z' });
    expect(receipt.createdAt).toBe(receipt.updatedAt);
  });

  it('rejects a fractional amount', () => {
    // A float here is how cents-vs-dollars bugs enter the database.
    expect(() => createReceipt({ ...base, amountCents: 49.95 })).toThrow(TypeError);
  });

  it('rejects a work-use percentage outside 0–100', () => {
    expect(() => createReceipt({ ...base, workUsePercent: 150 })).toThrow(RangeError);
    expect(() => createReceipt({ ...base, workUsePercent: -1 })).toThrow(RangeError);
  });

  it('rejects a fractional work-use percentage', () => {
    expect(() => createReceipt({ ...base, workUsePercent: 33.3 })).toThrow(RangeError);
  });

  it('rejects a malformed purchase date', () => {
    expect(() => createReceipt({ ...base, purchaseDate: '01/08/2026' })).toThrow(RangeError);
  });

  it('defaults the substantiation exemption to null', () => {
    expect(createReceipt(base).substantiationExemption).toBeNull();
  });
});

describe('createWfhLog', () => {
  const base = { id: 'w1', date: '2026-08-01', hours: 7.5 };

  it('derives the financial year', () => {
    expect(createWfhLog(base).financialYear).toBe(2026);
  });

  it('allows fractional hours', () => {
    expect(createWfhLog(base).hours).toBe(7.5);
  });

  it('rejects zero or negative hours', () => {
    expect(() => createWfhLog({ ...base, hours: 0 })).toThrow(RangeError);
    expect(() => createWfhLog({ ...base, hours: -3 })).toThrow(RangeError);
  });

  it('rejects more than 24 hours in a day', () => {
    expect(() => createWfhLog({ ...base, hours: 25 })).toThrow(RangeError);
  });
});

describe('createVehicleTrip', () => {
  const base = {
    id: 'v1',
    date: '2026-08-01',
    kilometres: 42,
    purpose: 'Client site',
    vehicleLabel: 'Corolla',
  };

  it('derives the financial year', () => {
    expect(createVehicleTrip(base).financialYear).toBe(2026);
  });

  it('rejects zero or negative distance', () => {
    expect(() => createVehicleTrip({ ...base, kilometres: 0 })).toThrow(RangeError);
    expect(() => createVehicleTrip({ ...base, kilometres: -5 })).toThrow(RangeError);
  });

  it('keeps the vehicle label, since the km cap is per car', () => {
    expect(createVehicleTrip(base).vehicleLabel).toBe('Corolla');
  });
});
