import {
  MERCHANT_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  emptyReceiptForm,
  validateReceiptForm,
  type ReceiptFormValues,
} from '@/domain/receiptForm';

function form(overrides: Partial<ReceiptFormValues> = {}): ReceiptFormValues {
  return {
    merchant: 'Officeworks',
    amount: '49.95',
    purchaseDate: '2026-07-03',
    categoryId: 'stationery',
    workUsePercent: '100',
    notes: '',
    ...overrides,
  };
}

describe('a valid form', () => {
  it('converts to domain values', () => {
    const result = validateReceiptForm(form());

    expect(result).toEqual({
      ok: true,
      value: {
        merchant: 'Officeworks',
        amountCents: 4995,
        purchaseDate: '2026-07-03',
        categoryId: 'stationery',
        workUsePercent: 100,
        notes: null,
      },
    });
  });

  it('trims the merchant and notes', () => {
    const result = validateReceiptForm(form({ merchant: '  Bunnings  ', notes: '  drill  ' }));

    expect(result.ok && result.value.merchant).toBe('Bunnings');
    expect(result.ok && result.value.notes).toBe('drill');
  });

  it('stores blank notes as null, not an empty string', () => {
    expect(validateReceiptForm(form({ notes: '   ' }))).toMatchObject({
      ok: true,
      value: { notes: null },
    });
  });

  it('accepts a work-use percentage typed with a % sign', () => {
    expect(validateReceiptForm(form({ workUsePercent: '60%' }))).toMatchObject({
      ok: true,
      value: { workUsePercent: 60 },
    });
  });

  it('accepts 0% — a receipt kept for records but not claimed', () => {
    expect(validateReceiptForm(form({ workUsePercent: '0' }))).toMatchObject({
      ok: true,
      value: { workUsePercent: 0 },
    });
  });
});

describe('merchant', () => {
  it.each([[''], ['   ']])('is required (%s)', (merchant) => {
    const result = validateReceiptForm(form({ merchant }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.merchant).toBe('Enter who you paid.');
  });

  it('is capped in length', () => {
    const result = validateReceiptForm(form({ merchant: 'x'.repeat(MERCHANT_MAX_LENGTH + 1) }));
    expect(!result.ok && result.errors.merchant).toContain(String(MERCHANT_MAX_LENGTH));
  });

  it('accepts exactly the maximum length', () => {
    expect(validateReceiptForm(form({ merchant: 'x'.repeat(MERCHANT_MAX_LENGTH) })).ok).toBe(true);
  });
});

describe('amount', () => {
  it.each([[''], ['abc'], ['0'], ['12.345'], ['-5']])('rejects %s', (amount) => {
    const result = validateReceiptForm(form({ amount }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.amount).toBeDefined();
  });

  it('surfaces the specific parse message, not a generic one', () => {
    const result = validateReceiptForm(form({ amount: '0.00' }));
    expect(!result.ok && result.errors.amount).toBe('Amount must be more than zero.');
  });
});

describe('purchase date', () => {
  it.each([['not-a-date'], ['03/07/2026'], ['2026-02-30']])('rejects %s', (purchaseDate) => {
    const result = validateReceiptForm(form({ purchaseDate }));
    expect(!result.ok && result.errors.purchaseDate).toBe('Choose a date.');
  });
});

describe('category', () => {
  it('is required', () => {
    const result = validateReceiptForm(form({ categoryId: '' }));
    expect(!result.ok && result.errors.categoryId).toBe('Choose a category.');
  });

  // A category could be dropped by a later build while a draft still names it.
  it('must exist', () => {
    const result = validateReceiptForm(form({ categoryId: 'no-such-category' }));
    expect(!result.ok && result.errors.categoryId).toContain('no longer available');
  });
});

describe('work-use percent', () => {
  it.each([['101'], ['-1'], ['50.5'], ['abc'], [''], ['1000']])('rejects %s', (workUsePercent) => {
    const result = validateReceiptForm(form({ workUsePercent }));
    expect(!result.ok && result.errors.workUsePercent).toBe(
      'Enter a whole number from 0 to 100.',
    );
  });

  it.each([['0'], ['1'], ['50'], ['100']])('accepts %s', (workUsePercent) => {
    expect(validateReceiptForm(form({ workUsePercent })).ok).toBe(true);
  });
});

describe('notes', () => {
  it('is capped in length', () => {
    const result = validateReceiptForm(form({ notes: 'x'.repeat(NOTES_MAX_LENGTH + 1) }));
    expect(!result.ok && result.errors.notes).toContain(String(NOTES_MAX_LENGTH));
  });
});

describe('error collection', () => {
  // A form that reveals one problem per submit makes the user guess repeatedly.
  it('reports every invalid field at once, not just the first', () => {
    const result = validateReceiptForm(
      form({ merchant: '', amount: 'abc', categoryId: '', workUsePercent: '500' }),
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      'amount',
      'categoryId',
      'merchant',
      'workUsePercent',
    ]);
  });
});

describe('emptyReceiptForm', () => {
  it('defaults work use to 100% — the common case', () => {
    expect(emptyReceiptForm('2026-07-03').workUsePercent).toBe('100');
  });

  it('starts with no category so the user makes a deliberate choice', () => {
    expect(emptyReceiptForm('2026-07-03').categoryId).toBe('');
  });
});
