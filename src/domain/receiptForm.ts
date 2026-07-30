/**
 * Receipt form validation.
 *
 * Pure, and deliberately separate from the screen: the rules about what makes a
 * receipt valid are the part worth testing, and a React component can't be
 * tested without a renderer. The screen holds strings and renders errors; this
 * module decides what those errors are.
 */

import { InvalidAmountError, parseAmountToCents } from '@/lib/money';
import { currentFy, fyStartYear, parseIsoDate, type IsoDate } from '@/lib/financialYear';
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

/**
 * Financial years back from the current one before a date is worth querying.
 *
 * Two, not one: in July someone is normally entering receipts for the year that
 * just ended, and warning about the ordinary case would train people to ignore
 * the message. Individuals can generally amend two years back, so a receipt that
 * old is plausible — just unusual enough to be worth a glance.
 */
export const BACKDATE_WARNING_FY_THRESHOLD = 2;

/**
 * A note about a purchase date that looks like a slip, or `null` if it doesn't.
 *
 * A warning, never an error: backdating is legitimate — amendments, a late
 * lodgment, a receipt found in a drawer — so this must not block saving. It
 * exists because `2011` for `2021` is a plausible typo, and the receipt then
 * files itself into a year the user has no reason to go looking in.
 *
 * Returns `null` for an unparseable date; `validateReceiptForm` reports that.
 */
export function purchaseDateWarning(purchaseDate: string, now: Date = new Date()): string | null {
  let fy: number;
  try {
    fy = fyStartYear(purchaseDate);
  } catch {
    return null;
  }

  const thisFy = currentFy(now);

  // The date picker caps at today, so this is only reachable on a receipt whose
  // date was already stored — but a wrong year here is worth saying out loud.
  if (fy > thisFy) {
    return 'That date is in the future. Check the year.';
  }

  const yearsBack = thisFy - fy;
  if (yearsBack < BACKDATE_WARNING_FY_THRESHOLD) {
    return null;
  }

  return (
    `That's ${yearsBack} financial years ago. ` +
    'Fine if you meant it — worth checking the year otherwise.'
  );
}

/** A whole 0–100, or `null` if the text isn't one. */
function parseWorkUsePercent(input: string): number | null {
  const cleaned = input.trim().replace(/%$/, '').trim();
  if (!/^\d{1,3}$/.test(cleaned)) return null;

  const value = Number(cleaned);
  return value >= 0 && value <= 100 ? value : null;
}
