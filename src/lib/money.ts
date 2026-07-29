/**
 * Money handling.
 *
 * Amounts are integer cents everywhere — in the domain, in SQLite, and in the
 * exports. Dollars only ever exist as text the user reads or types.
 *
 * Parsing is done on the *digits of the string*, never via `Number(x) * 100`.
 * `49.95 * 100` is `4994.999999999999` in IEEE 754, so the obvious approach
 * loses a cent on ordinary amounts. In a tax app that is a wrong number in a
 * document going to the ATO.
 */

/** `4995` → `"$49.95"`. Always two decimal places. */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`Expected integer cents, received ${cents}`);
  }

  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100);
  const remainder = absolute % 100;

  const formatted = `$${dollars.toLocaleString('en-AU')}.${String(remainder).padStart(2, '0')}`;
  return negative ? `-${formatted}` : formatted;
}

/** `4995` → `"49.95"`. For prefilling a text input, so no `$` and no grouping. */
export function centsToInput(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`Expected integer cents, received ${cents}`);
  }
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${dollars}.${String(remainder).padStart(2, '0')}`;
}

/**
 * Amount text as typed, with the noise people include: a leading `$`,
 * thousands separators, surrounding spaces.
 */
const AMOUNT_PATTERN = /^(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/;

export class InvalidAmountError extends Error {}

/**
 * Parse typed dollars into integer cents.
 *
 * Deliberately strict. A silently-accepted `"12.345"` or `"1 2"` becomes a
 * wrong deduction, so anything ambiguous throws and the form shows a message
 * rather than guessing what was meant.
 */
export function parseAmountToCents(input: string): number {
  const cleaned = input.trim().replace(/^\$/, '').trim();

  if (cleaned.length === 0) {
    throw new InvalidAmountError('Enter an amount.');
  }

  const match = AMOUNT_PATTERN.exec(cleaned);
  if (match === null) {
    throw new InvalidAmountError('Enter an amount like 49.95.');
  }

  const dollars = Number(match[1].replace(/,/g, ''));
  // '5' means 50 cents, not 5 — pad right, not left.
  const cents = Number((match[2] ?? '0').padEnd(2, '0'));

  const total = dollars * 100 + cents;

  if (!Number.isSafeInteger(total)) {
    throw new InvalidAmountError('That amount is too large.');
  }
  if (total === 0) {
    throw new InvalidAmountError('Amount must be more than zero.');
  }

  return total;
}
