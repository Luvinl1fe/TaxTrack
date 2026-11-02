import {
  ACTIVE_CATEGORIES,
  standardDeductionCategoryIds,
} from "@/domain/categories";
import {
  createReceipt,
  createVehicleTrip,
  createWfhLog,
} from "@/domain/factories";
import {
  compareWithStandardDeduction,
  countsTowardStandardDeduction,
  evidenceTestNote,
  standardDeductionMessage,
  type StandardDeductionInput,
} from "@/domain/standardDeduction";
import type { Receipt } from "@/domain/types";
import { calculateVehicleClaim } from "@/domain/vehicleCalculator";
import { calculateWfhClaim } from "@/domain/wfhCalculator";

/** FY 2026–27, the first year with a standard deduction. */
const FY = 2026;
const NOW = "2026-08-15T02:30:00.000Z";

let nextId = 0;
function receipt(
  categoryId: string,
  amountCents: number,
  workUsePercent = 100,
): Receipt {
  nextId += 1;
  return createReceipt({
    id: `r${nextId}`,
    merchant: "Shop",
    amountCents,
    purchaseDate: "2026-08-15",
    categoryId,
    workUsePercent,
    now: NOW,
  });
}

function input(
  overrides: Partial<StandardDeductionInput> = {},
): StandardDeductionInput {
  return {
    receipts: [],
    vehicle: null,
    tripCount: 0,
    wfh: null,
    logCount: 0,
    ...overrides,
  };
}

describe("which expenses count (s 25-130)", () => {
  it("counts car expenses, unlike the $300 evidence test", () => {
    // Division 28 is named in s 25-130, so cents-per-km and car receipts count.
    expect(standardDeductionCategoryIds()).toContain("car");
  });

  it("leaves out association memberships, which are claimed on top", () => {
    expect(standardDeductionCategoryIds()).not.toContain("union-subscriptions");
  });

  it("leaves out gifts and tax affairs, which are not work expenses", () => {
    const ids = standardDeductionCategoryIds();
    expect(ids).not.toContain("gifts-donations");
    expect(ids).not.toContain("tax-affairs");
  });

  it("counts every other work-related category from D1 to D5", () => {
    const expected = ACTIVE_CATEGORIES.filter(
      (c) =>
        ["D1", "D2", "D3", "D4", "D5"].includes(c.myTaxLabel) &&
        c.id !== "union-subscriptions",
    ).map((c) => c.id);
    expect(standardDeductionCategoryIds().sort()).toEqual(expected.sort());
  });

  it("counts allowance-covered travel, which the $300 test excludes", () => {
    const flight = {
      ...receipt("travel", 40_000),
      substantiationExemption: "travel_allowance" as const,
    };
    expect(countsTowardStandardDeduction(flight)).toBe(true);
  });

  it("ignores deleted receipts and unknown categories", () => {
    expect(
      countsTowardStandardDeduction({
        ...receipt("clothing", 100),
        deletedAt: NOW,
      }),
    ).toBe(false);
    expect(
      countsTowardStandardDeduction(receipt("no-such-category", 100)),
    ).toBe(false);
  });
});

describe("compareWithStandardDeduction", () => {
  it("returns null for a year before the standard deduction existed", () => {
    expect(compareWithStandardDeduction(input(), 2025)).toBeNull();
  });

  it("returns null for a year with no rates on file", () => {
    expect(compareWithStandardDeduction(input(), 2010)).toBeNull();
  });

  it("uses $1,000 for 2026–27", () => {
    expect(compareWithStandardDeduction(input(), FY)?.standardCents).toBe(
      100_000,
    );
  });

  it("favours the standard deduction below $1,000", () => {
    const result = compareWithStandardDeduction(
      input({
        receipts: [
          receipt("clothing", 40_000),
          receipt("phone-internet", 24_000),
        ],
      }),
      FY,
    );
    expect(result?.itemisedCents).toBe(64_000);
    expect(result?.better).toBe("standard");
    expect(result?.differenceCents).toBe(36_000);
  });

  it("favours the standard deduction at exactly $1,000, since it needs no evidence", () => {
    const result = compareWithStandardDeduction(
      input({ receipts: [receipt("clothing", 100_000)] }),
      FY,
    );
    expect(result?.better).toBe("standard");
    expect(result?.differenceCents).toBe(0);
  });

  it("favours itemising one cent past $1,000", () => {
    const result = compareWithStandardDeduction(
      input({ receipts: [receipt("clothing", 100_001)] }),
      FY,
    );
    expect(result?.better).toBe("itemise");
    expect(result?.differenceCents).toBe(1);
  });

  it("counts only the work-use portion of a receipt", () => {
    // $1,500 phone plan at 60% work use is $900 — still under.
    const result = compareWithStandardDeduction(
      input({ receipts: [receipt("phone-internet", 150_000, 60)] }),
      FY,
    );
    expect(result?.receiptsCents).toBe(90_000);
    expect(result?.better).toBe("standard");
  });

  it("leaves non-work deductions out of the comparison entirely", () => {
    // $2,000 of donations and union fees don't make itemising worthwhile — they
    // are claimed on top whichever way the work expenses go.
    const result = compareWithStandardDeduction(
      input({
        receipts: [
          receipt("gifts-donations", 100_000),
          receipt("union-subscriptions", 60_000),
          receipt("tax-affairs", 40_000),
        ],
      }),
      FY,
    );
    expect(result?.itemisedCents).toBe(0);
    expect(result?.better).toBe("standard");
  });

  it("adds car and working-from-home claims to the receipts", () => {
    // 1,000 km × 91c = $910, 100 h × 70c (provisional) = $70, $50 of stationery:
    // $1,030 in all, so the calculators are what tip it over.
    const trips = [
      createVehicleTrip({
        id: "t1",
        date: "2026-08-15",
        kilometres: 1_000,
        purpose: "Site visits",
        vehicleLabel: "Hilux",
        now: NOW,
      }),
    ];
    const logs = Array.from({ length: 10 }, (_, index) =>
      createWfhLog({
        id: `w${index}`,
        date: `2026-08-${String(index + 10).padStart(2, "0")}`,
        hours: 10,
        now: NOW,
      }),
    );

    const result = compareWithStandardDeduction(
      input({
        receipts: [receipt("stationery", 5_000)],
        vehicle: calculateVehicleClaim(trips, FY),
        tripCount: trips.length,
        wfh: calculateWfhClaim(logs, FY),
        logCount: logs.length,
      }),
      FY,
    );

    expect(result).toMatchObject({
      receiptsCents: 5_000,
      vehicleCents: 91_000,
      wfhCents: 7_000,
      itemisedCents: 103_000,
      better: "itemise",
      differenceCents: 3_000,
    });
  });

  it("flags a total that leans on a provisional rate", () => {
    const logs = [
      createWfhLog({ id: "w", date: "2026-08-15", hours: 8, now: NOW }),
    ];
    const result = compareWithStandardDeduction(
      input({ wfh: calculateWfhClaim(logs, FY), logCount: 1 }),
      FY,
    );
    // Holds until the 2026–27 fixed rate is published; then this test should
    // be rewritten against a year that still has a provisional rate, if any.
    expect(result?.includesEstimate).toBe(true);
  });

  it("does not flag an estimate when the provisional figure contributes nothing", () => {
    const result = compareWithStandardDeduction(
      input({
        wfh: calculateWfhClaim([], FY),
        receipts: [receipt("clothing", 100)],
      }),
      FY,
    );
    expect(result?.includesEstimate).toBe(false);
  });

  it("flags records that could not be valued, so the total is a floor", () => {
    const result = compareWithStandardDeduction(
      input({ wfh: null, logCount: 3 }),
      FY,
    );
    expect(result?.incomplete).toBe(true);
    expect(compareWithStandardDeduction(input(), FY)?.incomplete).toBe(false);
  });
});

describe("standardDeductionMessage", () => {
  function messageFor(receipts: Receipt[]): string {
    const comparison = compareWithStandardDeduction(input({ receipts }), FY);
    if (comparison === null) throw new Error("expected a comparison");
    return standardDeductionMessage(comparison);
  }

  it("says the standard deduction replaces expenses below it, not adds to them", () => {
    const message = messageFor([receipt("clothing", 64_000)]);
    expect(message).toContain("$640.00");
    expect(message).toContain("$360.00 short of $1,000.00");
    expect(message).toContain("replaces them");
  });

  it("says what itemising gains, and that it needs records", () => {
    const message = messageFor([receipt("clothing", 124_000)]);
    expect(message).toContain(
      "$240.00 more than the $1,000.00 standard deduction",
    );
    expect(message).toContain("records");
  });

  it("explains the deduction before anything is logged", () => {
    expect(messageFor([])).toContain("applied automatically");
  });

  it("never suggests claiming both", () => {
    for (const amount of [0, 64_000, 100_000, 124_000]) {
      expect(messageFor([receipt("clothing", amount)])).not.toMatch(
        /on top of the standard|plus the/i,
      );
    }
  });
});

describe("evidenceTestNote", () => {
  it("says the $300 rule only matters if you itemise, while the standard deduction wins", () => {
    const comparison = compareWithStandardDeduction(
      input({ receipts: [receipt("clothing", 64_000)] }),
      FY,
    );
    const note = evidenceTestNote(comparison);
    expect(note).toContain("only matters if you itemise");
    expect(note).toContain("$1,000.00");
    // Still worth keeping them: expenses can pass $1,000 later in the year.
    expect(note).toContain("keep them anyway");
  });

  it("adds nothing once itemising wins, when the evidence rule applies in full", () => {
    const comparison = compareWithStandardDeduction(
      input({ receipts: [receipt("clothing", 124_000)] }),
      FY,
    );
    expect(evidenceTestNote(comparison)).toBeNull();
  });

  it("adds nothing for a year without a standard deduction", () => {
    expect(evidenceTestNote(null)).toBeNull();
  });
});
