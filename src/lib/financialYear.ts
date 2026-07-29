/**
 * Australian financial-year helpers.
 *
 * The FY runs 1 July – 30 June, and is identified throughout the app by its
 * *start* year: `2026` means the 2026–27 financial year.
 *
 * Dates are plain `YYYY-MM-DD` strings rather than `Date` objects or
 * timestamps. A `Date` is an instant in UTC, so formatting one back into a
 * calendar date can shift it a day in either direction depending on the
 * device's timezone — which is exactly how a 30 June receipt ends up filed in
 * the wrong tax year. Strings sidestep the problem instead of managing it.
 *
 * Known limitation, accepted deliberately: `currentFy()` reads the device's
 * local calendar date, and Australian timezones span three hours. A user in
 * Perth just before midnight on 30 June is already on 1 July in Sydney, so two
 * users pressing "add receipt" at the same instant can land in different
 * financial years. The window is a few hours a year, the device's own date is
 * what the user sees on their lock screen, and the date is editable on every
 * entry — so this is left as-is rather than engineered around.
 */

/** A calendar date in `YYYY-MM-DD` form. */
export type IsoDate = string;

export interface DateParts {
  year: number;
  /** 1-based: January is 1. */
  month: number;
  day: number;
}

export interface FyBounds {
  /** First day of the financial year, inclusive. */
  start: IsoDate;
  /** Last day of the financial year, inclusive. */
  end: IsoDate;
}

/** July — the first month of the Australian financial year. */
const FY_START_MONTH = 7;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in a 1-based month. Computed directly rather than via `Date`, which
 *  remaps two-digit years into the 1900s and would get the leap rule wrong. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1];
}

/**
 * Parse and validate a `YYYY-MM-DD` date.
 *
 * Rejects malformed strings and impossible calendar dates (`2026-02-30`)
 * rather than silently rolling them over into the next month, which is what
 * `new Date()` would do.
 */
export function parseIsoDate(date: IsoDate): DateParts {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) {
    throw new RangeError(`Expected a 'YYYY-MM-DD' date, received '${date}'`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) {
    throw new RangeError(`Month must be 01–12, received '${date}'`);
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`Day is out of range for that month, received '${date}'`);
  }

  return { year, month, day };
}

/** Format a `Date` as `YYYY-MM-DD` using its *local* calendar components. */
export function toIsoDate(date: Date): IsoDate {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Cannot format an invalid Date');
  }
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a stored date for display as `DD/MM/YY`.
 *
 * Day-first is the Australian convention, and the only one an ATO form or a
 * local receipt ever uses. Storage stays `YYYY-MM-DD` — this is a display
 * concern and the conversion happens at the edge, never in the database.
 *
 * Built from the parsed parts rather than `toLocaleDateString`, which varies
 * with the device's locale: a phone set to US English would render 03/07/26
 * as 7 March instead of 3 July.
 */
export function formatDateAu(date: IsoDate): string {
  const { year, month, day } = parseIsoDate(date);
  const shortYear = String(year % 100).padStart(2, '0');
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${shortYear}`;
}

/**
 * The financial year a date falls in, as its start year.
 *
 * July onward belongs to the year it starts in, so 2026-07-01 → 2026, while
 * 2026-06-30 → 2025.
 */
export function fyStartYear(date: IsoDate): number {
  const { year, month } = parseIsoDate(date);
  return month >= FY_START_MONTH ? year : year - 1;
}

/** Human-readable label for a financial year: `2026` → `"2026–27"`. */
export function fyLabel(fy: number): string {
  assertValidFy(fy);
  const endYear = String((fy + 1) % 100).padStart(2, '0');
  // En dash, matching how the ATO writes financial years.
  return `${fy}–${endYear}`;
}

/** Inclusive first and last day of a financial year. */
export function fyBounds(fy: number): FyBounds {
  assertValidFy(fy);
  return {
    start: `${fy}-07-01`,
    end: `${fy + 1}-06-30`,
  };
}

/** Whether a date falls within the given financial year. */
export function isInFy(date: IsoDate, fy: number): boolean {
  assertValidFy(fy);
  return fyStartYear(date) === fy;
}

/**
 * The financial year in progress on the device today.
 *
 * `now` is injectable so tests don't depend on the clock.
 */
export function currentFy(now: Date = new Date()): number {
  return fyStartYear(toIsoDate(now));
}

function assertValidFy(fy: number): void {
  if (!Number.isInteger(fy)) {
    throw new RangeError(`Financial year must be a whole start year, received ${fy}`);
  }
}
