/**
 * The cents-per-kilometre method for car expenses.
 *
 * Claim = business kilometres × the year's rate, capped at 5,000 km **per car**.
 * The cap is per vehicle, not per taxpayer: someone who drove two cars for work
 * has two 5,000 km allowances, and totalling their kilometres first would
 * understate the claim.
 *
 * The method covers *all* car expenses for that vehicle — fuel, servicing,
 * insurance, depreciation. It cannot be combined with separate claims for the
 * same car, and it needs no receipts, only a reasonable basis for the
 * kilometres. That's why car expenses are excluded from the $300 substantiation
 * test (see `substantiation.ts`).
 *
 * Applies to cars: vehicles designed to carry under one tonne and fewer than
 * nine passengers. Motorcycles and larger vehicles use actual costs instead —
 * out of scope for Phase 1, and the reason `vehicleLabel` is free text rather
 * than a vehicle type.
 *
 * @see PHASE_1_PLAN.md §6; ITAA 1997 Subdiv 28-C
 */

import { resolveRate, ratesForFy } from '@/config/atoRates';
import type { VehicleTrip } from '@/domain/types';

export interface VehicleClaim {
  vehicleLabel: string;
  /** Kilometres logged for this car in the year. */
  kilometres: number;
  /** Kilometres actually claimable — `kilometres` capped at the per-car limit. */
  claimableKilometres: number;
  /** True when the cap bit, so the screen can say why the figure stopped rising. */
  capped: boolean;
  claimableCents: number;
  tripCount: number;
}

export interface VehicleCalculation {
  claims: VehicleClaim[];
  totalClaimableCents: number;
  /** The rate applied, in cents per kilometre. */
  centsPerKm: number;
  /** True when `centsPerKm` is an assumption standing in for an unpublished rate. */
  provisional: boolean;
  /** The per-car kilometre cap for the year. */
  capPerCar: number;
}

/**
 * Work out the claim for a financial year.
 *
 * Returns `null` when the year has no cents-per-km rate — published or
 * provisional — so the screen shows `rateUnavailableMessage()` rather than a
 * figure computed from nothing. Callers must handle it.
 *
 * Pass only the trips for the year in question; this does no filtering, because
 * the repository's query already does it and doing it twice invites the two to
 * disagree.
 */
export function calculateVehicleClaim(
  trips: VehicleTrip[],
  fy: number,
): VehicleCalculation | null {
  const rate = resolveRate(fy, 'centsPerKm');
  const rates = ratesForFy(fy);
  if (rate === null || rates === null) return null;

  const capPerCar = rates.kmCapPerCar;
  const byVehicle = new Map<string, { kilometres: number; tripCount: number }>();

  for (const trip of trips) {
    // Labels are compared exactly as typed. 'Hilux' and 'hilux' are two cars as
    // far as this is concerned, each with its own cap — a known gap the entry UI
    // has to prevent rather than something to paper over here, since collapsing
    // case would silently merge two genuinely different labels.
    const existing = byVehicle.get(trip.vehicleLabel);
    if (existing === undefined) {
      byVehicle.set(trip.vehicleLabel, { kilometres: trip.kilometres, tripCount: 1 });
    } else {
      existing.kilometres += trip.kilometres;
      existing.tripCount += 1;
    }
  }

  const claims: VehicleClaim[] = [...byVehicle.entries()].map(([vehicleLabel, totals]) => {
    const claimableKilometres = Math.min(totals.kilometres, capPerCar);

    return {
      vehicleLabel,
      kilometres: totals.kilometres,
      claimableKilometres,
      capped: totals.kilometres > capPerCar,
      // Rounded once, here, at the end. Kilometres are REAL and the rate is
      // whole cents, so the product is fractional cents — which have no meaning
      // on a return.
      claimableCents: Math.round(claimableKilometres * rate.cents),
      tripCount: totals.tripCount,
    };
  });

  // Largest claim first, ties broken on label so the order is stable between
  // renders rather than following insertion order.
  claims.sort(
    (a, b) => b.claimableCents - a.claimableCents || a.vehicleLabel.localeCompare(b.vehicleLabel),
  );

  return {
    claims,
    // Sum of the per-car figures, each already rounded. Rounding the total
    // instead would disagree with the rows the user can see and add up.
    totalClaimableCents: claims.reduce((sum, claim) => sum + claim.claimableCents, 0),
    centsPerKm: rate.cents,
    provisional: rate.provisional,
    capPerCar,
  };
}

/**
 * How far a car is through its cap, as a fraction from 0 to 1.
 *
 * For a progress bar. Clamped at 1 so a car past the cap doesn't overflow it.
 */
export function capProgress(claim: VehicleClaim, capPerCar: number): number {
  if (capPerCar <= 0) return 0;
  return Math.min(1, claim.kilometres / capPerCar);
}
