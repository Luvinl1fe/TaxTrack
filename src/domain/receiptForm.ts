/**
 * Receipt form validation.
 *
 * Pure, and deliberately separate from the screen: the rules about what makes a
 * receipt valid are the part worth testing, and a React component can't be
 * tested without a renderer. The screen holds strings and renders errors; this
 * module decides what those errors are.
 */

import { InvalidAmountError, parseAmountToCents } from '@/lib/money';
import { parseIsoDate, type IsoDate } from '@/lib/financialYear';
import { categoryById } from '@/domain/categories';

/** The form's raw state — every field is the text the user actually typed. */
export interface ReceiptFormValues {
  merchant: string;
  amount: string;
  purchaseDate: IsoDate;
  categoryId: string;
  workUsePercent: string;
  notes: string;
}

/** A message per invalid field, keyed to the input it belongs under. */
export type ReceiptFormErrors = Partial<Record<keyof ReceiptFormValues, string>>;

export interface ValidatedReceipt {
  merchant: string;
  amountCents: number;
  purchaseDate: IsoDate;
  categoryId: string;
  workUsePercent: number;
  notes: string | null;
}

export type ValidationResult =
  | { ok: true; value: ValidatedReceipt }
  | { ok: false; errors: ReceiptFormErrors };

export const MERCHANT_MAX_LENGTH = 100;
export const NOTES_MAX_LENGTH = 500;

export function emptyReceiptForm(purchaseDate: IsoDate): ReceiptFormValues {
  return {
    merchant: '',
    amount: '',
    purchaseDate,
    categoryId: '',
    workUsePercent: '100',
    notes: '',
  };
}

/**
 * Validate every field, rather than stopping at the first failure.
 *
 * A form that reveals one problem at a time makes the user submit repeatedly to
 * discover what's wrong. All errors are collected so they can be shown at once.
 */
export function validateReceiptForm(values: ReceiptFormValues): ValidationResult {
  const errors: ReceiptFormErrors = {};

  const merchant = values.merchant.trim();
  if (merchant.length === 0) {
    errors.merchant = 'Enter who you paid.';
  } else if (merchant.length > MERCHANT_MAX_LENGTH) {
    errors.merchant = `Keep this under ${MERCHANT_MAX_LENGTH} characters.`;
  }

  let amountCents = 0;
  try {
    amountCents = parseAmountToCents(values.amount);
  } catch (cause) {
    errors.amount =
      cause instanceof InvalidAmountError ? cause.message : 'Enter an amount like 49.95.';
  }

  try {
    parseIsoDate(values.purchaseDate);
  } catch {
    errors.purchaseDate = 'Choose a date.';
  }

  if (values.categoryId.length === 0) {
    errors.categoryId = 'Choose a category.';
  } else if (categoryById(values.categoryId) === null) {
    errors.categoryId = 'That category is no longer available. Choose another.';
  }

  const workUsePercent = parseWorkUsePercent(values.workUsePercent);
  if (workUsePercent === null) {
    errors.workUsePercent = 'Enter a whole number from 0 to 100.';
  }

  const notes = values.notes.trim();
  if (notes.length > NOTES_MAX_LENGTH) {
    errors.notes = `Keep notes under ${NOTES_MAX_LENGTH} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      merchant,
      amountCents,
      purchaseDate: values.purchaseDate,
      categoryId: values.categoryId,
      // Non-null: an error would have been recorded above otherwise.
      workUsePercent: workUsePercent as number,
      notes: notes.length > 0 ? notes : null,
    },
  };
}

/** A whole 0–100, or `null` if the text isn't one. */
function parseWorkUsePercent(input: string): number | null {
  const cleaned = input.trim().replace(/%$/, '').trim();
  if (!/^\d{1,3}$/.test(cleaned)) return null;

  const value = Number(cleaned);
  return value >= 0 && value <= 100 ? value : null;
}
