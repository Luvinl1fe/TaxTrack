/**
 * Deduction categories, and how they map to myTax labels.
 *
 * Seeded into the `categories` table on first run. Category IDs are stable
 * strings and are referenced by every receipt, so **renaming an ID after
 * release requires a data migration**. Display names can change freely.
 *
 * Designed to be extended by adding rows, not by changing shape: the Phase 3
 * categories (D6 low-value pool, D7 interest, D8 dividends) are listed here
 * already, marked `phase: 3` and filtered out of the UI, so enabling them
 * later is a flag flip and a seed insert rather than a schema change.
 *
 * @see PHASE_1_PLAN.md §6
 */

/** The myTax deduction labels a category can roll up to. */
export type MyTaxLabel = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7' | 'D8' | 'D9' | 'D10';

export interface Category {
  /** Stable identifier. Referenced by receipts — never renamed after release. */
  id: string;
  name: string;
  /** The myTax label this category is reported under. */
  myTaxLabel: MyTaxLabel;
  /**
   * Whether this category's spend counts toward the aggregate substantiation
   * threshold in `FyRates.substantiationThresholdCents`.
   *
   * Scope comes from ITAA 1997 s 900-35 and TR 1999/10: the test covers *work
   * expenses* generally, excluding car expenses, travel allowance expenses,
   * meal allowance expenses, and award transport payments (s 900-35(3)). It is
   * not a D5-only rule — clothing and self-education are in scope.
   *
   * Note the threshold is a cliff, not an excess: over $300, *all* work
   * expenses must be substantiated, not just the amount above $300.
   *
   * This is the *category-level default*. Three of the four exclusions are
   * properties of an individual expense rather than its category — see
   * `Receipt.substantiationExemption`.
   */
  countsTowardSubstantiationThreshold: boolean;
  /**
   * Whether entries are receipts or a purpose-built log. `wfh` hours and
   * vehicle `trips` are calculated from logs, not from receipt amounts.
   */
  entryKind: 'receipt' | 'wfh' | 'trips';
  /** The build phase this category becomes available in. */
  phase: 1 | 3;
  examples: string;
}

export const CATEGORIES: readonly Category[] = [
  {
    id: 'car',
    name: 'Car & vehicle',
    myTaxLabel: 'D1',
    // Car expenses sit outside the aggregate substantiation test.
    countsTowardSubstantiationThreshold: false,
    entryKind: 'trips',
    phase: 1,
    examples: 'Cents-per-km trips, parking, tolls',
  },
  {
    id: 'travel',
    name: 'Travel',
    myTaxLabel: 'D2',
    // Counts by default. The s 900-35 exclusion is narrower than the category:
    // it covers *travel allowance* and *meal allowance* expenses, which have
    // their own reasonable-amounts exception — not all D2 travel. Ordinary
    // work travel not covered by an allowance is in scope, and is the common
    // case, so the category default is `true` and the exception is recorded
    // per receipt via `substantiationExemption`.
    countsTowardSubstantiationThreshold: true,
    entryKind: 'receipt',
    phase: 1,
    examples: 'Airfares, accommodation, meals away overnight',
  },
  {
    id: 'clothing',
    name: 'Clothing & laundry',
    myTaxLabel: 'D3',
    countsTowardSubstantiationThreshold: true,
    entryKind: 'receipt',
    phase: 1,
    examples: 'Uniforms, protective gear, laundry',
  },
  {
    id: 'self-education',
    name: 'Self-education',
    myTaxLabel: 'D4',
    countsTowardSubstantiationThreshold: true,
    entryKind: 'receipt',
    phase: 1,
    examples: 'Course fees, textbooks, student contributions',
  },

  // --- D5: one ATO label, split eight ways for usable category totals. ---
  {
    id: 'wfh',
    name: 'Working from home',
    myTaxLabel: 'D5',
    countsTowardSubstantiationThreshold: true,
    entryKind: 'wfh',
    phase: 1,
    examples: 'Hours logged under the fixed-rate method',
  },
  {
    id: 'phone-internet',
    name: 'Phone & internet',
    myTaxLabel: 'D5',
    countsTowardSubstantiationThreshold: true,
    entryKind: 'receipt',
    phase: 1,
    examples: 'Work portion of phone and data plans',
  },
  {
    id: 'tools-equipment',
    name: 'Tools & equipment',
    myTaxLabel: 'D5',
    countsTowardSubstantiationThreshold: true,
    entryKind: 'receipt',
    phase: 1,
    examples: 'Laptops, tools, office furniture',
  },
  {
    id: 'union-subscriptions',
    name: 'Union fees & subscriptions',
    myTaxLabel: 'D5',
    countsTowardSubstantiationThreshold: true,
    entryKind: 'receipt',
    phase: 1,
    examples: 'Union dues, professional memberships',
  },
  {
    id: 'books-periodicals',
    name: 'Books & periodicals',
    myTaxLabel: 'D5',
    countsTowardSubstantiationThreshold: true,
    entryKind: 'receipt',
    phase: 1,
    examples: 'Trade journals, professional publications',
  },
  {
    id: 'seminars-conferences',
    name: 'Seminars & conferences',
    myTaxLabel: 'D5',
    countsTowardSubstantiationThreshold: true,
    entryKind: 'receipt',
    phase: 1,
    examples: 'Registration, training courses',
  },
  {
    id: 'stationery',
    name: 'Stationery & consumables',
    myTaxLabel: 'D5',
    countsTowardSubstantiationThreshold: true,
    entryKind: 'receipt',
    phase: 1,
    examples: 'Printer ink, paper, general supplies',
  },
  {
    id: 'other-work-related',
    name: 'Other work-related',
    myTaxLabel: 'D5',
    countsTowardSubstantiationThreshold: true,
    entryKind: 'receipt',
    phase: 1,
    examples: 'Catch-all so nothing goes unrecorded',
  },
  // --- end D5 ---

  {
    id: 'gifts-donations',
    name: 'Gifts & donations',
    myTaxLabel: 'D9',
    // Not a work expense; outside the work-related substantiation test.
    countsTowardSubstantiationThreshold: false,
    entryKind: 'receipt',
    phase: 1,
    examples: 'DGR-endorsed charities',
  },
  {
    id: 'tax-affairs',
    name: 'Managing tax affairs',
    myTaxLabel: 'D10',
    countsTowardSubstantiationThreshold: false,
    entryKind: 'receipt',
    phase: 1,
    examples: 'Accountant fees, tax agent charges',
  },

  // --- Phase 3. Present so enabling them is a flag flip, not a migration. ---
  {
    id: 'low-value-pool',
    name: 'Low-value pool',
    myTaxLabel: 'D6',
    countsTowardSubstantiationThreshold: false,
    entryKind: 'receipt',
    phase: 3,
    examples: 'Depreciating assets pooled below the write-off threshold',
  },
  {
    id: 'interest',
    name: 'Interest deductions',
    myTaxLabel: 'D7',
    countsTowardSubstantiationThreshold: false,
    entryKind: 'receipt',
    phase: 3,
    examples: 'Interest on investment borrowings',
  },
  {
    id: 'dividends',
    name: 'Dividend deductions',
    myTaxLabel: 'D8',
    countsTowardSubstantiationThreshold: false,
    entryKind: 'receipt',
    phase: 3,
    examples: 'Costs of earning dividend income',
  },
];

/** Categories available in the current build. */
export const ACTIVE_CATEGORIES: readonly Category[] = CATEGORIES.filter((c) => c.phase === 1);

export function categoryById(id: string): Category | null {
  return CATEGORIES.find((c) => c.id === id) ?? null;
}

/** Categories whose spend counts toward the aggregate substantiation threshold. */
export function substantiationCategoryIds(): string[] {
  return ACTIVE_CATEGORIES.filter((c) => c.countsTowardSubstantiationThreshold).map((c) => c.id);
}
