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

**Found:** milestone 4.

Validation (`receiptForm.ts`), money and the FY module are covered. The screens
that use them are not: nothing verifies that a save actually reaches the
repository, that the form loads an existing receipt into its fields, or that
returning from the form refreshes the list.

**Why it exists:** a deliberate MVP trade-off — `PHASE_1_PLAN.md` §10 calls for
real unit tests on logic and minimal UI testing. Form logic was extracted into a
pure module specifically so the untested surface is thin.

**How to close:** `@testing-library/react-native` on the receipt form, if the
screens start carrying logic of their own rather than delegating to modules.

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

### 🟠 `SqliteWfhLogRepository` and `SqliteVehicleTripRepository` have never run on a device

**Found:** milestone 3. **Narrowed:** milestone 5.

Both are now executed by the `better-sqlite3` tests — save, get, list, the
soft-delete filter, `totalHours` and `kilometresByVehicle` all run real SQL. What
remains is that no screen has ever called them, so nothing has exercised them
against the device's own SQLite build or with data a user actually typed.

**How to close:** milestone 6 (WFH + vehicle calculators), where the screens
arrive and the done-when check runs on the phone.

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

### 🟡 WFH hours are stored as REAL, so totals carry float error

**Found:** milestone 5.

`wfh_logs.hours` is REAL and `totalHours` is a SQL `SUM()`. Ordinary values like
7.6 aren't exactly representable, so a year of logs can total a hair off the
decimal figure — `19.75` is exact, `19.7` is not.

**Why it's accepted for now:** nothing consumes the total yet. Money is integer
cents everywhere precisely to avoid this; hours escaped that rule because they
are genuinely fractional.

**How to close:** milestone 6 has to decide where hours get rounded on the way
to a deduction — once, at the end, on `hours × cents-per-hour` — and test that
figure rather than the raw sum.

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

### 🟠 The repositories have no automated tests

**Found:** milestone 3. **Closed:** milestone 5, branch
`milestone-5-repository-tests`.

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
