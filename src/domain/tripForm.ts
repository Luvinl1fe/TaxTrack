/**
 * Vehicle trip form validation.
 *
 * Pure and outside the screen, same reasoning as `receiptForm.ts`: the rules are
 * the part worth testing, and a React component can't be tested without a
 * renderer.
 */

import { currentFy, fyStartYear, parseIsoDate, type IsoDate } from '@/lib/financialYear';

export interface TripFormValues {
  date: IsoDate;
  /** Kilometres as typed, so "12.5" survives round-tripping through the input. */
  kilometres: string;
  purpose: string;
  vehicleLabel: string;
}

export type TripFormErrors = Partial<Record<keyof TripFormValues, string>>;

export interface ValidatedTrip {
  date: IsoDate;
  kilometres: number;
  purpose: string;
  vehicleLabel: string;
}

export type TripValidationResult =
  | { ok: true; value: ValidatedTrip }
  | { ok: false; errors: TripFormErrors };

export const PURPOSE_MAX_LENGTH = 200;
export const VEHICLE_LABEL_MAX_LENGTH = 60;

/**
 * The longest single trip we'll accept without complaint, in kilometres.
 *
 * Perth to Sydney is about 4,000 km, so a single leg beyond that is far more
 * likely a decimal slip — 1500 for 150.0 — than a real drive. It's an error
 * rather than a warning because the whole claim is kilometres: one bad figure
 * moves the deduction by thousands of dollars, unlike a mistyped date which only
 * files a receipt in the wrong year.
 */
export const MAX_TRIP_KILOMETRES = 4_500;

export function emptyTripForm(date: IsoDate, vehicleLabel = ''): TripFormValues {
  return { date, kilometres: '', purpose: '', vehicleLabel };
}

/** Kilometres as a positive number, or `null` if the text isn't one. */
export function parseKilometres(input: string): number | null {
  const cleaned = input.trim().replace(/(km|kms)$/i, '').trim();
  // At most one decimal place beyond hundredths: odometers don't do better, and
  // accepting more implies a precision the claim doesn't have.
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(cleaned)) return null;

  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Validate every field at once, so the user isn't told one problem per submit. */
export function validateTripForm(values: TripFormValues): TripValidationResult {
  const errors: TripFormErrors = {};

  try {
    parseIsoDate(values.date);
  } catch {
    errors.date = 'Choose a date.';
  }

  const kilometres = parseKilometres(values.kilometres);
  if (kilometres === null) {
    errors.kilometres = 'Enter the distance, like 12.5.';
  } else if (kilometres > MAX_TRIP_KILOMETRES) {
    errors.kilometres = `That's over ${MAX_TRIP_KILOMETRES.toLocaleString('en-AU')} km for one trip. Check the decimal point.`;
  }

  const purpose = values.purpose.trim();
  if (purpose.length === 0) {
    // Required, unlike a receipt's notes: the ATO expects a work-related reason
    // for each trip, and "I drove somewhere" isn't a claim.
    errors.purpose = 'Say what the trip was for.';
  } else if (purpose.length > PURPOSE_MAX_LENGTH) {
    errors.purpose = `Keep this under ${PURPOSE_MAX_LENGTH} characters.`;
  }

  const vehicleLabel = values.vehicleLabel.trim();
  if (vehicleLabel.length === 0) {
    errors.vehicleLabel = 'Name the car, so its 5,000 km cap is tracked separately.';
  } else if (vehicleLabel.length > VEHICLE_LABEL_MAX_LENGTH) {
    errors.vehicleLabel = `Keep this under ${VEHICLE_LABEL_MAX_LENGTH} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      date: values.date,
      // Non-null: an error would have been recorded above otherwise.
      kilometres: kilometres as number,
      purpose,
      vehicleLabel,
    },
  };
}

/**
 * A label that differs from an existing one only by case or spacing, if there is
 * one.
 *
 * Labels are matched exactly when kilometres are grouped, so 'hilux' and 'Hilux'
 * would each get their own 5,000 km cap and quietly overstate the claim. The form
 * offers the existing spelling rather than silently rewriting what was typed —
 * the user may genuinely have two similarly named cars.
 */
export function similarVehicleLabel(
  typed: string,
  existing: readonly string[],
): string | null {
  const normalise = (label: string) => label.trim().toLowerCase().replace(/\s+/g, ' ');
  const target = normalise(typed);
  if (target.length === 0) return null;

  return existing.find((label) => normalise(label) === target && label !== typed.trim()) ?? null;
}

/**
 * A note about a trip date that looks like a slip, or `null`.
 *
 * Mirrors `purchaseDateWarning` — a warning, never an error, because logging an
 * old trip is legitimate.
 */
export function tripDateWarning(date: string, now: Date = new Date()): string | null {
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
