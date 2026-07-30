# Known gaps

A running, honest list of what is **not** covered, not tested, or knowingly
deferred. Kept alongside the code so gaps are visible rather than remembered.

Every milestone adds its gaps here as they're found. A gap leaves this file
only when it's closed (moved to **Closed**, with the commit or PR that closed
it) — never by quietly deleting the row.

**Severity:**
- 🔴 **Blocks release** — must be closed before real users touch it.
- 🟠 **Risk** — a wrong result or data loss is possible; close before the
  feature it affects becomes user-facing.
- 🟡 **Deferred by design** — a deliberate Phase 1 scope decision, not an
  oversight.

---

## Open

### 🟠 Deleting a receipt leaves its photo on disk

**Found:** milestone 4.

`softDelete` tombstones the row but nothing removes the file under
`Documents/receipts/`. Photos are the largest thing the app writes, so a user
who adds and deletes receipts over a year accumulates storage they can't see or
reclaim.

**Why it exists:** deletes are soft so they can replicate (see milestone 3). The
row still references the photo, and a future sync could restore it — so
deleting the file at tombstone time would destroy evidence the user might get
back.

**How to close:** a cleanup pass that removes photos for rows tombstoned longer
than the sync retention window. Needs the sync design from milestone 8 to know
what that window is.

---

### 🟠 No screen has an automated test

**Found:** milestone 4. **Widened:** milestone 5.

Validation (`receiptForm.ts`), search and grouping (`receiptList.ts`), money and
the FY module are covered. The screens that use them are not: nothing verifies
that a save reaches the repository, that the form loads an existing receipt into
its fields, that returning from the form refreshes the list, or that the tab bar
and year selector wire up as intended.

**Why it exists:** a deliberate MVP trade-off — `PHASE_1_PLAN.md` §10 calls for
real unit tests on logic and minimal UI testing. Form logic, then search,
grouping and year selection, were each extracted into pure modules specifically
so the untested surface stays thin.

**Verified instead by:** hand passes on device, 30 July 2026 — all four tabs, the
year sheet, sticky headers, search, every empty state, the delete confirmations,
and an edit refreshing the other tabs on return. Milestone 6 added the vehicle cap
bars, the car-name chips, the duplicate-day warning and the double-claim card to
that pass.

**What's untested but not trivial**, and so worth re-checking by hand after any
change to the dashboard or list:

- `useFocusEffect` refresh — the reason a saved receipt appears without a reload
- the shared `FinancialYearProvider`, which both tabs read
- `SectionList` sticky headers and the search box's fixed position above it

**How to close:** `@testing-library/react-native` on the receipt form and the
list, if the screens start carrying logic of their own rather than delegating to
modules.

---

### 🟡 Photo capture can't be verified in Jest

**Found:** milestone 4.

`src/lib/photos.ts` has no tests. `expo-file-system` and `expo-image-picker` are
native modules and don't load in Jest's Node environment, same constraint as
`expo-sqlite`.

**Verified instead by:** the milestone 4 done-when check — attach a photo,
force-quit, reopen, photo still renders.

**Watch for:** the cache-to-documents copy is the part that matters. If it ever
regresses, photos vanish weeks later rather than immediately, so a manual check
right after saving would not catch it.

---

### 🟡 Repository tests run on `better-sqlite3`, not the device's SQLite

**Found:** milestone 5.

The tests that close the SQL gap execute against `better-sqlite3` in Node. That
is a different SQLite build from the one `expo-sqlite` ships, so in principle a
statement could pass in Jest and behave differently on the phone.

**Why it's accepted:** the alternative is no SQL coverage at all. The statements
executed are byte-for-byte the app's own, and the behaviour they depend on —
`ROUND()` half-away-from-zero, `SUM()` over no rows being `NULL`, text ordering
of `YYYY-MM-DD` — is core SQLite, not build-specific.

**Watch for:** anything relying on a compile-time option, a collation, or a
SQLite version feature. The `PRAGMA journal_mode = WAL` in `openAndPrepare` is
already untested for this reason: it's meaningless for `:memory:`.

---

### 🟠 Return-facing figures are shown in cents, but a return is in whole dollars

**Found:** milestone 6, from the ATO's own worked example.

The ATO's cents-per-kilometre example (published 4 May 2026, QC107246) works out
2,514 km × 88c and states the deduction as **$2,212** — not $2,212.32. Deductions
are entered on a return in whole dollars. The app computes and displays
$2,212.32, which is correct arithmetic and the wrong presentation for anything
someone copies onto a return.

**Why it's not just cosmetic:** it decides whether the export in milestone 7
matches what the taxpayer types into myTax. It also needs a direction — the ATO's
example truncates rather than rounds half-up (32c dropped), and truncating is the
taxpayer-safe direction for a deduction.

**Why it isn't fixed yet:** cents are right for storage and for the running
totals a user checks against receipts. Only the *return-facing* figure should be
whole dollars, and the app has no return-facing surface until CSV/PDF export.
Doing it now would mean guessing where that boundary sits.

**How to close:** decide it in milestone 7, and apply truncation to whole dollars
at the export boundary only. A test in `vehicleCalculator.test.ts` already pins
the ATO example on both sides of that rounding.

---

### 🟡 Two spellings of one car mean two 5,000 km caps

**Found:** milestone 5 (in a test). **Mitigated:** milestone 6.

`vehicleLabel` is free text and kilometres group on an exact match, so `Hilux` and
`hilux` are two cars — each with its own 5,000 km cap, quietly overstating the
claim of anyone who mistypes.

**Why it isn't fixed by normalising:** collapsing case in the calculator would
merge labels a user may have meant to keep apart, and it would change the meaning
of trips already saved. The fix belongs at entry, not in the arithmetic.

**Mitigated by**, in the trip form: the cars already logged are offered as
tappable chips (`vehicleLabels()`), the last-used car is prefilled, and
`similarVehicleLabel()` warns when a typed label differs from an existing one only
by case or spacing, offering the existing spelling in one tap.

**Still open because** nothing *prevents* it. A determined user can still save
`hilux` alongside `Hilux`, and there's no way to merge two labels after the fact.

**How to close:** a rename/merge action on a car, which needs a settings surface
that doesn't exist yet.

---

### 🟡 Local-only storage means no backup

**Found:** milestone 3.

The SQLite database lives in the app's private sandbox on the phone. Lose the
phone or delete the app and a year of receipts goes with it. There is no export
and no sync yet.

**Why it exists:** deliberate. Local-first is what makes the app work offline,
with no account and no infrastructure cost.

**How to close:** partially by milestone 7 (CSV/PDF export gives users a manual
out), fully by milestone 8 (Firebase sync).

**Also needs:** onboarding copy that says this plainly. A user should learn it
when they start, not when they lose their phone. Milestone 5 puts one line on the
dashboard's empty state — "Receipts are stored on this phone only. There is no
backup yet." — which a first-time user sees, but it disappears as soon as they
add a receipt. A permanent home for it is still missing.

---

### 🟡 The disclaimer appears in only one of its three required places

**Found:** milestone 5.

`PHASE_1_PLAN.md` §6 requires "not tax advice" on the first-run onboarding
screen, in settings, and in the footer of every export. Only the dashboard footer
carries it today, and neither an onboarding nor a settings screen exists.

**How to close:** the export footers in milestone 7, which also brings the
settings screen. Onboarding has no milestone of its own yet — worth deciding
before the validation checkpoint at milestone 7, since it's also where the
local-only storage warning above belongs.

---

### 🔴 The 2026–27 WFH fixed rate is unpublished — a provisional 70c stands in

**Found:** milestone 2. **Provisional value added:** milestone 6. Tracked in
`PHASE_1_PLAN.md` §12.

`ATO_RATES[2026].wfhCentsPerHour` is still `null`. The ATO's Fixed rate method
page listed rates only through 2025–26 as at 8 June 2026, and it returns 403 to
automated fetches, so it has to be checked by hand.

**Why it exists:** blocked on the ATO, not on us. The published field deliberately
holds `null` rather than carrying last year's 70c forward, because a stale rate
produces a confidently wrong deduction.

**What changed in milestone 6:** so development isn't stalled, `ATO_RATES[2026]`
now carries `provisional: { wfhCentsPerHour: 70 }` — the last published figure.
The safety property is structural rather than a matter of discipline:

- `getRate()` and `ratesForFy().wfhCentsPerHour` still return `null`. Every
  existing caller behaves exactly as before, and a test asserts this.
- The only route to the number is `resolveRate()`, which returns
  `{ cents, provisional: true }`. The flag is in the same object as the value, so
  no caller can obtain the figure without learning it is an assumption.
- Any screen showing such a figure must render `provisionalRateMessage()`, which
  ends "don't put it on your return".

**Why this is still 🔴 and not downgraded:** a provisional rate is fine for
building and testing, and unacceptable in a released app. Shipping it would put
an estimate in front of someone preparing a return.

**How to close:** set `wfhCentsPerHour` once the ATO publishes, and delete the
`provisional` block for 2026. A test enforces that a provisional value only ever
exists where the published one is `null`, so leaving both would fail.

---

### 🟡 FY boundary is device-local across Australian timezones

**Found:** milestone 2. Tracked in `PHASE_1_PLAN.md` §12.

`currentFy()` reads the device's local calendar date, and Australia spans three
hours. Within a few hours of midnight on 30 June, two users in different states
can land in different financial years.

**Why it's accepted:** the device's date is what the user sees on their lock
screen, and the date is editable on every entry. The exposure is a few hours a
year.

---

## Closed

### 🟠 `SqliteWfhLogRepository` and `SqliteVehicleTripRepository` had never executed

**Found:** milestone 3. **Narrowed:** milestone 5. **Closed:** milestone 6.

Both were written and typechecked but had never been called — not by a test, not
by a screen. Typechecking proved the shapes lined up and said nothing about
whether the SQL ran.

**Closed in three steps:**

1. Milestone 5's `better-sqlite3` harness executed the real statements in Node —
   save, get, list, the soft-delete filter, `totalHours` and
   `kilometresByVehicle`.
2. Milestone 6 gave both repositories real screens, so they run in the app rather
   than only under Jest.
3. Both were exercised on a device on 30 July 2026: trips and hours logged,
   edited and deleted, surviving a force-quit and reopen.

**What this does not cover:** nothing verifies these paths automatically at the
screen level — see the open screen-testing gap. The device pass is a point-in-time
check, not a regression test.

---

### 🟡 WFH hours are stored as REAL, so totals carry float error

**Found:** milestone 5. **Closed:** milestone 6.

`wfh_logs.hours` is REAL, so ordinary values like 7.6 aren't exactly
representable and a year of logs can total a hair off the decimal figure —
`19.75` is exact, `19.7` is not.

**Closed by deciding where the rounding happens**, which was the open question:
`calculateWfhClaim()` sums the hours and rounds **once**, at the end, on
`hours × cents-per-hour`. A residue of ~1e-15 hours cannot survive a rounding to
whole cents, so the float error can no longer reach a figure the user sees.

Two tests pin it: `7.6 + 2.4` — which is `10.000000000000002` in IEEE 754 —
produces exactly 700 cents, and the calculator's TypeScript sum is asserted
against SQL's `SUM()` with the rounded cents required to be *identical* rather
than merely close.

`formatHours()` rounds for display the same way, so the same sum never renders as
`10.000000000000002 hours`.

**What isn't claimed:** hours are still REAL in the database. That's deliberate —
they are genuinely fractional, unlike money — and it no longer matters, because
nothing consumes the raw sum.

---

### 🟠 The repositories have no automated tests

**Found:** milestone 3. **Closed:** milestone 5, PR #4.

The SQL had only ever been verified by hand on a device, because `expo-sqlite` is
a native module that won't load in Jest. The risk that mattered:
`totalsByCategory` apportions work-use in SQL while `deductibleCents()` does the
same arithmetic in TypeScript, and nothing proved the two agreed — a total a few
cents off what the receipts add up to is plausible enough that nobody notices, in
a document going to the ATO.

**Closed by** `src/db/driver.ts`, a six-method interface `expo-sqlite` already
satisfies, plus an adapter over in-memory `better-sqlite3` in
`test-support/sqliteTestDatabase.ts`. Tests execute the real `MIGRATIONS` DDL and
the real repository statements — no query rewriting — covering:

- the migration runner: fresh apply, idempotent re-run, the downgrade guard, and
  `user_version` staying put when a migration throws
- category seeding: list order, re-seed without duplicates, retired categories
  surviving
- receipts: full-field round trips (which is what proves the positional binds
  line up), upsert, the FY and `deleted_at IS NULL` filters, sort order,
  tombstoning
- `totalsByCategory` against hand-calculated fixtures, cross-checked against
  `deductibleCents()` and against the $300 substantiation total, and swept over
  all 101 work-use percentages at eight amounts

The sweep was verified to fail: replacing `ROUND(… / 100.0)` with integer
division breaks ten tests.

**Left open:** the two 🟡 gaps above, which this work surfaced rather than
introduced.
