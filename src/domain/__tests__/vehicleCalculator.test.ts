import { capProgress, calculateVehicleClaim } from '@/domain/vehicleCalculator';
import { createVehicleTrip } from '@/domain/factories';
import type { VehicleTrip } from '@/domain/types';

/** FY 2026-27, whose cents-per-km rate is published at 91c (LI 2026/19). */
const FY = 2026;
const RATE = 91;
const CAP = 5_000;

function trip(
  id: string,
  kilometres: number,
  vehicleLabel = 'Hilux',
  date = '2026-08-15',
): VehicleTrip {
  return createVehicleTrip({
    id,
    date,
    kilometres,
    purpose: 'Site visit',
    vehicleLabel,
    now: '2026-08-15T02:30:00.000Z',
  });
}

describe('calculateVehicleClaim', () => {
  it('returns an empty calculation for no trips', () => {
    const result = calculateVehicleClaim([], FY);

    expect(result).not.toBeNull();
    expect(result?.claims).toEqual([]);
    expect(result?.totalClaimableCents).toBe(0);
    // The rate is still reported, so the screen can explain the method before
    // any trips exist.
    expect(result?.centsPerKm).toBe(RATE);
  });

  it('multiplies kilometres by the published rate', () => {
    // 100 km × 91c = 9,100c = $91.00
    const result = calculateVehicleClaim([trip('a', 100)], FY);

    expect(result?.claims[0].claimableCents).toBe(9_100);
    expect(result?.totalClaimableCents).toBe(9_100);
  });

  it('reads the rate from config rather than embedding it', () => {
    expect(calculateVehicleClaim([trip('a', 1)], FY)?.centsPerKm).toBe(RATE);
    // 2025-26 was 88c. A calculator with a literal in it would return 91 here.
    expect(calculateVehicleClaim([trip('a', 1, 'Hilux', '2025-08-15')], 2025)?.centsPerKm).toBe(88);
  });

  it('reports the published rate as not provisional', () => {
    expect(calculateVehicleClaim([trip('a', 100)], FY)?.provisional).toBe(false);
  });

  it('returns null for a year with no rate at all', () => {
    // The screen must show rateUnavailableMessage rather than a figure computed
    // from nothing.
    expect(calculateVehicleClaim([trip('a', 100)], 1999)).toBeNull();
  });

  it('sums several trips for one car', () => {
    const result = calculateVehicleClaim(
      [trip('a', 120), trip('b', 80.5), trip('c', 12.25)],
      FY,
    );

    expect(result?.claims[0].kilometres).toBeCloseTo(212.75, 10);
    expect(result?.claims[0].tripCount).toBe(3);
    // 212.75 × 91 = 19,360.25c → 19,360
    expect(result?.claims[0].claimableCents).toBe(19_360);
  });

  it('rounds once at the end, not per trip', () => {
    // Three trips of 0.5 km: 1.5 km × 91 = 136.5c → 137. Rounding each trip
    // first would give 46 + 46 + 46 = 138.
    const result = calculateVehicleClaim([trip('a', 0.5), trip('b', 0.5), trip('c', 0.5)], FY);

    expect(result?.claims[0].claimableCents).toBe(137);
  });

  it('returns whole cents', () => {
    const result = calculateVehicleClaim([trip('a', 33.333)], FY);

    expect(Number.isInteger(result?.claims[0].claimableCents)).toBe(true);
  });
});

describe('the 5,000 km cap', () => {
  it('leaves a car under the cap alone', () => {
    const result = calculateVehicleClaim([trip('a', 4_999)], FY);

    expect(result?.claims[0].capped).toBe(false);
    expect(result?.claims[0].claimableKilometres).toBe(4_999);
  });

  it('does not treat exactly the cap as capped', () => {
    // The limit is inclusive: 5,000 km is fully claimable.
    const result = calculateVehicleClaim([trip('a', 5_000)], FY);

    expect(result?.claims[0].capped).toBe(false);
    expect(result?.claims[0].claimableCents).toBe(5_000 * RATE);
  });

  it('caps a car over the limit and says so', () => {
    const result = calculateVehicleClaim([trip('a', 7_500)], FY);

    expect(result?.claims[0].capped).toBe(true);
    expect(result?.claims[0].kilometres).toBe(7_500);
    expect(result?.claims[0].claimableKilometres).toBe(CAP);
    expect(result?.claims[0].claimableCents).toBe(CAP * RATE);
  });

  it('applies the cap per car, not per person', () => {
    // The rule this test exists for. Two cars at 4,000 km each is 8,000
    // claimable kilometres; totalling first would wrongly cap it at 5,000.
    const result = calculateVehicleClaim(
      [trip('a', 4_000, 'Hilux'), trip('b', 4_000, 'Corolla')],
      FY,
    );

    expect(result?.claims.every((claim) => !claim.capped)).toBe(true);
    expect(result?.totalClaimableCents).toBe(8_000 * RATE);
  });

  it('caps each car independently', () => {
    const result = calculateVehicleClaim(
      [trip('a', 6_000, 'Hilux'), trip('b', 1_000, 'Corolla')],
      FY,
    );

    const hilux = result?.claims.find((claim) => claim.vehicleLabel === 'Hilux');
    const corolla = result?.claims.find((claim) => claim.vehicleLabel === 'Corolla');

    expect(hilux?.capped).toBe(true);
    expect(hilux?.claimableKilometres).toBe(CAP);
    expect(corolla?.capped).toBe(false);
    expect(corolla?.claimableKilometres).toBe(1_000);
    expect(result?.totalClaimableCents).toBe((CAP + 1_000) * RATE);
  });

  it('reports the cap so the screen never hardcodes 5,000', () => {
    expect(calculateVehicleClaim([], FY)?.capPerCar).toBe(CAP);
  });
});

describe('grouping by vehicle', () => {
  it('groups trips under their car', () => {
    const result = calculateVehicleClaim(
      [trip('a', 100, 'Hilux'), trip('b', 50, 'Corolla'), trip('c', 25, 'Hilux')],
      FY,
    );

    expect(result?.claims).toHaveLength(2);
    expect(result?.claims.find((c) => c.vehicleLabel === 'Hilux')?.tripCount).toBe(2);
  });

  it('treats labels differing only by case as separate cars', () => {
    // Documented behaviour, not an endorsement: collapsing case would merge two
    // labels the user may have meant to keep apart. The entry UI has to stop
    // this happening — tracked in KNOWN_GAPS.
    const result = calculateVehicleClaim([trip('a', 100, 'Hilux'), trip('b', 100, 'hilux')], FY);

    expect(result?.claims).toHaveLength(2);
  });

  it('orders the largest claim first', () => {
    const result = calculateVehicleClaim(
      [trip('a', 10, 'Small'), trip('b', 900, 'Big'), trip('c', 100, 'Middle')],
      FY,
    );

    expect(result?.claims.map((claim) => claim.vehicleLabel)).toEqual(['Big', 'Middle', 'Small']);
  });

  it('breaks ties on label so the order does not shuffle between renders', () => {
    const result = calculateVehicleClaim([trip('a', 100, 'Zed'), trip('b', 100, 'Alfa')], FY);

    expect(result?.claims.map((claim) => claim.vehicleLabel)).toEqual(['Alfa', 'Zed']);
  });

  it('totals to the sum of the rows a user can see', () => {
    const result = calculateVehicleClaim(
      [trip('a', 33.33, 'Hilux'), trip('b', 66.67, 'Corolla'), trip('c', 12.5, 'Van')],
      FY,
    );

    const rowSum = result?.claims.reduce((sum, claim) => sum + claim.claimableCents, 0);
    expect(result?.totalClaimableCents).toBe(rowSum);
  });
});

describe("the ATO's published worked example", () => {
  /**
   * From the ATO's "Cents per kilometre method" page (published 4 May 2026,
   * QC107246):
   *
   *   Johan makes a 27 km round trip weekly and a 106 km round trip monthly.
   *   46 × 27 km = 1,242 km
   *   12 × 106 km = 1,272 km
   *   total 2,514 km
   *   2,514 km × 0.88 = $2,212   [2025-26]
   *
   * The example is the milestone 6 done-when bar, and it also pins the ATO's
   * *presentation*: it states $2,212, not $2,212.32. Deductions go on a return in
   * whole dollars. This calculator works in cents, so it returns 221,232 — the
   * same figure before that final rounding, which is asserted below so the
   * difference is recorded rather than discovered later.
   */
  const FY_2025_26 = 2025;

  it('reproduces the example to the cent', () => {
    const trips = [
      ...Array.from({ length: 46 }, (_, index) =>
        trip(`weekly-${index}`, 27, 'Johan car', '2025-08-15'),
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        trip(`monthly-${index}`, 106, 'Johan car', '2025-09-15'),
      ),
    ];

    const result = calculateVehicleClaim(trips, FY_2025_26);

    expect(result?.claims[0].kilometres).toBe(2_514);
    expect(result?.claims[0].tripCount).toBe(58);
    expect(result?.centsPerKm).toBe(88);
    expect(result?.totalClaimableCents).toBe(221_232); // $2,212.32
  });

  it("matches the ATO's stated figure once rounded to whole dollars", () => {
    const trips = [trip('a', 2_514, 'Johan car', '2025-08-15')];

    const result = calculateVehicleClaim(trips, FY_2025_26);

    // The ATO writes $2,212. Whole dollars is how a return is completed, so any
    // export or return-facing figure has to round — currently a presentation
    // decision the app hasn't made. Tracked in KNOWN_GAPS.
    expect(Math.floor((result?.totalClaimableCents ?? 0) / 100)).toBe(2_212);
  });

  it('reaches the same total whether logged as one trip or fifty-eight', () => {
    // Rounding once at the end is what makes this true. Per-trip rounding would
    // drift by a cent or two across 58 trips.
    const single = calculateVehicleClaim([trip('a', 2_514, 'Car', '2025-08-15')], FY_2025_26);
    const many = calculateVehicleClaim(
      Array.from({ length: 58 }, (_, index) => trip(`t${index}`, 2_514 / 58, 'Car', '2025-08-15')),
      FY_2025_26,
    );

    expect(many?.totalClaimableCents).toBe(single?.totalClaimableCents);
  });
});

describe('published ATO figures', () => {
  // The milestone 6 done-when bar. These are the maximum-claim figures the ATO
  // states alongside each year's rate — rate × the 5,000 km cap — so they check
  // the rate and the cap combine correctly rather than merely consistently.
  //
  // NOTE: the ATO's own worked examples could not be fetched (the page returns
  // 403 to automated requests), so these encode the published maximums rather
  // than a transcribed example. Worth eyeballing one ATO example by hand before
  // milestone 6 is called done.
  it.each([
    [2024, 88, 440_000], // 5,000 × 88c = $4,400
    [2025, 88, 440_000],
    [2026, 91, 455_000], // 5,000 × 91c = $4,550, LI 2026/19
  ])('FY %i at %ic caps a single car at %i cents', (fy, rate, maxCents) => {
    const result = calculateVehicleClaim([trip('a', 10_000, 'Hilux', `${fy + 1}-05-20`)], fy);

    expect(result?.centsPerKm).toBe(rate);
    expect(result?.claims[0].claimableCents).toBe(maxCents);
    expect(result?.totalClaimableCents).toBe(maxCents);
  });

  it('claims a plain 1,000 km at the 2026-27 rate', () => {
    // 1,000 × 91c = $910.00
    const result = calculateVehicleClaim([trip('a', 1_000)], FY);

    expect(result?.totalClaimableCents).toBe(91_000);
  });
});

describe('capProgress', () => {
  const claimAt = (kilometres: number) =>
    calculateVehicleClaim([trip('a', kilometres)], FY)!.claims[0];

  it('is zero with no distance', () => {
    expect(capProgress(claimAt(0.0001), CAP)).toBeCloseTo(0, 3);
  });

  it('is half way at half the cap', () => {
    expect(capProgress(claimAt(2_500), CAP)).toBeCloseTo(0.5, 10);
  });

  it('is full at the cap', () => {
    expect(capProgress(claimAt(5_000), CAP)).toBe(1);
  });

  it('clamps rather than overflowing past the cap', () => {
    expect(capProgress(claimAt(50_000), CAP)).toBe(1);
  });

  it('does not divide by zero on a nonsense cap', () => {
    expect(capProgress(claimAt(100), 0)).toBe(0);
  });
});
