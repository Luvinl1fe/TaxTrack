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

### 🟠 The repositories have no automated tests

**Found:** milestone 3.

The mappers, schema, factories and domain logic are covered. The actual SQL is
not: the migration runner, `totalsByCategory`'s apportionment, and the
`deleted_at IS NULL` filter have only ever been verified by hand on a device.

**Why it exists:** `expo-sqlite` is a native module and won't load in Jest's
Node environment, so the usual approach doesn't work.

**Why it matters:** `totalsByCategory` rounds apportioned amounts in SQL to
match `deductibleCents()` in TypeScript. If those two ever disagree, the app
shows a total that's a few cents off what the receipts add up to — plausible
enough that nobody notices, in a document going to the ATO.

**How to close:** add `better-sqlite3` as a dev dependency and run the real
`MIGRATIONS` DDL and the real queries against in-memory SQLite in Node. Covers
the migration path and the aggregate maths without a device.

**When:** before milestone 5, where totals become user-facing.

---

### 🟠 `SqliteWfhLogRepository` and `SqliteVehicleTripRepository` have never executed

**Found:** milestone 3.

Both are written and typechecked, but nothing has ever called them — not in
tests, not on device. The dev screen only exercises receipts. Typechecking
proves the shapes line up; it says nothing about whether the SQL runs.

**How to close:** exercised for real in milestone 6 (WFH + vehicle
calculators), and covered by the `better-sqlite3` tests above.

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
when they start, not when they lose their phone.

---

### 🔴 The 2026–27 WFH fixed rate is unpublished

**Found:** milestone 2. Tracked in `PHASE_1_PLAN.md` §12.

`ATO_RATES[2026].wfhCentsPerHour` is `null`. The ATO's Fixed rate method page
(last updated 8 June 2026) still lists rates only through 2025–26.

**Why it exists:** blocked on the ATO, not on us. The config deliberately holds
`null` rather than carrying last year's 70c forward, because a stale rate
produces a confidently wrong deduction.

**How to close:** set the rate once published. It's a release gate for the WFH
calculator (milestone 6), not a research task.

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

_Nothing yet._
