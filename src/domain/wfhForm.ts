/**
 * WFH log form validation.
 *
 * Pure and outside the screen, same reasoning as `receiptForm.ts` and
 * `tripForm.ts`.
 */

import { currentFy, fyStartYear, parseIsoDate, type IsoDate } from '@/lib/financialYear';

export interface WfhFormValues {
  date: IsoDate;
  /** Hours as typed, so "7.6" survives round-tripping through the input. */
  hours: string;
  notes: string;
}

export type WfhFormErrors = Partial<Record<keyof WfhFormValues, string>>;

export interface ValidatedWfhLog {
  date: IsoDate;
  hours: number;
  notes: string | null;
}

export type WfhValidationResult =
  | { ok: true; value: ValidatedWfhLog }
  | { ok: false; errors: WfhFormErrors };

export const WFH_NOTES_MAX_LENGTH = 300;

/** A day has 24 hours; `createWfhLog` rejects more, so the form must too. */
export const MAX_HOURS_PER_LOG = 24;

/**
 * Hours beyond which a single day's entry is worth querying.
 *
 * A 16-hour day is possible and not our business to forbid. It is, however, a
 * more likely typo than a fact — 12 for 1.2, say — so it warns rather than blocks.
 */
export const LONG_DAY_HOURS = 16;

export function emptyWfhForm(date: IsoDate): WfhFormValues {
  return { date, hours: '', notes: '' };
}

/**
 * Hours as a positive number, or `null` if the text isn't one.
 *
 * Accepts `7`, `7.5`, `7.75` and a trailing `h`. Rejects `7:30`: a colon reads as
 * minutes, and silently treating it as 7.3 hours would be wrong by 18 minutes a
 * day. The field asks for decimal hours and the hint says so.
 */
export function parseHours(input: string): number | null {
  const cleaned = input.trim().replace(/(hrs|hr|h)$/i, '').trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(cleaned)) return null;

  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Validate every field at once, so the user isn't told one problem per submit. */
export function validateWfhForm(values: WfhFormValues): WfhValidationResult {
  const errors: WfhFormErrors = {};

  try {
    parseIsoDate(values.date);
  } catch {
    errors.date = 'Choose a date.';
  }

  const hours = parseHours(values.hours);
  if (hours === null) {
    errors.hours = 'Enter the hours, like 7.5.';
  } else if (hours > MAX_HOURS_PER_LOG) {
    errors.hours = `A day only has ${MAX_HOURS_PER_LOG} hours.`;
  }

  const notes = values.notes.trim();
  if (notes.length > WFH_NOTES_MAX_LENGTH) {
    errors.notes = `Keep notes under ${WFH_NOTES_MAX_LENGTH} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      date: values.date,
      // Non-null: an error would have been recorded above otherwise.
      hours: hours as number,
      notes: notes.length > 0 ? notes : null,
    },
  };
}

/**
 * A note about the hours entered, or `null`.
 *
 * Two cases, both warnings rather than errors:
 *
 * - the day already has hours logged, so this entry adds to them rather than
 *   replacing them — the most likely way a total silently doubles
 * - the day is implausibly long
 *
 * `alreadyLogged` is the hours on that date excluding the log being edited.
 */
export function hoursWarning(hours: string, alreadyLogged: number): string | null {
  const parsed = parseHours(hours);
  if (parsed === null) return null;

  if (alreadyLogged > 0) {
    const combined = Number((alreadyLogged + parsed).toFixed(2));
    if (combined > MAX_HOURS_PER_LOG) {
      return `This day already has ${formatHours(alreadyLogged)} logged. Adding ${formatHours(parsed)} would make ${formatHours(combined)} — more than a day.`;
    }
    return `This day already has ${formatHours(alreadyLogged)} logged. This adds to it, for ${formatHours(combined)} total.`;
  }

  if (parsed > LONG_DAY_HOURS) {
    return `${formatHours(parsed)} is a long day. Fine if you meant it — check the decimal point otherwise.`;
  }

  return null;
}

/** `7.5` → `"7.5 hours"`, `1` → `"1 hour"`. No trailing `.0`. */
export function formatHours(hours: number): string {
  const trimmed = Number(hours.toFixed(2));
  return `${trimmed.toLocaleString('en-AU')} ${trimmed === 1 ? 'hour' : 'hours'}`;
}

/**
 * A note about a log date that looks like a slip, or `null`.
 *
 * Mirrors `purchaseDateWarning` and `tripDateWarning`.
 */
export function wfhDateWarning(date: string, now: Date = new Date()): string | null {
  let fy: number;
  try {
    fy = fyStartYear(date);
  } catch {
    return null;
  }

  const thisFy = currentFy(now);
  if (fy > thisFy) return 'That date is in the future. Check the year.';

  const yearsBack = thisFy - fy;
  if (yearsBack < 2) return null;

  return `That's ${yearsBack} financial years ago. Fine if you meant it — worth checking the year otherwise.`;
}
