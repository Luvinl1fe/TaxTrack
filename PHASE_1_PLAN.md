# TaxTrack — Phase 1 Build Plan

Companion to [TaxTrack_Pitch.md](./TaxTrack_Pitch.md). The pitch describes *what* we're building and why; this document records the engineering decisions for actually shipping Phase 1.

**Status:** planning complete, no code written yet.

---

## 1. Scope

### In scope

All of Phase 1 from the pitch:

- Manual receipt entry + photo attach
- ATO-category dropdown at entry
- Automatic financial-year (Jul–Jun) buckets
- Running totals by category
- Export to CSV/PDF for accountant or myTax
- $300 no-receipt threshold nudge
- Cloud backup/sync via Firebase

**Plus two features pulled forward from Phase 2:**

- WFH hours calculator (fixed-rate method)
- Vehicle logbook calculator (cents-per-km method)

These two are pure arithmetic — cheap to build — but they're the substance of the pitch's claim to beat myDeductions. Shipping Phase 1 without them means shipping a nicer filing cabinet, not a differentiated product.

### Explicitly out of scope

OCR receipt scanning · bank-feed reconciliation · asset depreciation · refund estimation · occupation-based deduction checklists · EOFY reminders/notifications.

Occupation checklists are deferred because they're content-curation work (researching ATO occupation guides), not engineering, and they'd gate the build on research time.

---

## 2. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Expo + React Native + TypeScript** | One codebase → iOS + Android. Runs on a real phone via Expo Go (QR scan) with no Xcode or Android Studio. |
| Navigation | **Expo Router** | File-based routing, the Expo default; less boilerplate than hand-wiring React Navigation. |
| Local database | **expo-sqlite** | Relational queries for category totals and FY filtering. Works in Expo Go. |
| Photos | **expo-camera** + **expo-image-picker** | Capture new receipts or attach existing photos. |
| File storage | **expo-file-system** | Receipt images written to app documents directory. |
| PDF export | **expo-print** (HTML → PDF) + **expo-sharing** | No native module needed; renders an HTML summary to PDF. |
| Cloud (final milestone) | **Firebase JS SDK** (`firebase` package) | ⚠️ Deliberately *not* `@react-native-firebase/*` — see §8. |
| Tests | **jest-expo** | Unit tests for logic modules. |

---

## 3. Environment prerequisites

Verified on this machine (July 2026) — **the toolchain is not currently installed**:

| Tool | Status |
| --- | --- |
| Node / npm | ❌ Not installed — **step zero** |
| Full Xcode | ❌ Command Line Tools only |
| iOS Simulator | ❌ None available |
| Android SDK / emulator | ❌ Not installed |
| Flutter | ❌ Not installed (not needed) |
| Swift 6.3.2, OpenJDK 11, Python 3.9.6, git | ✅ Present |

**Consequence:** there is no simulator or emulator to fall back on. The development loop is **Expo Go on a physical phone**, connected over the same Wi-Fi network. This is fine — arguably better, since camera and receipt capture are the core interactions and both are more honestly tested on real hardware.

Install Node via Homebrew before anything else. Everything after that is `npx`.

**Scaffolding note:** the repo already contains tracked files (`README.md`, the two `.md` docs). `create-expo-app` expects an empty directory, so scaffold into a temporary directory and move the generated files in, rather than running it in place and risking the existing files.

---

## 4. Data architecture

**Local-first.** The app is fully usable with no account and no network. Firebase is layered on at the end (§8), not wired first.

Everything goes through a **repository interface** so the SQLite implementation and a later Firestore-backed one stay interchangeable:

```ts
interface ReceiptRepository {
  list(fy: number, opts?: { categoryId?: string }): Promise<Receipt[]>;
  get(id: string): Promise<Receipt | null>;
  save(receipt: Receipt): Promise<void>;
  softDelete(id: string): Promise<void>;
  totalsByCategory(fy: number): Promise<CategoryTotal[]>;
}
```

Screens talk only to repositories, never to SQLite directly.

### Schema sketch

```sql
CREATE TABLE receipts (
  id                TEXT PRIMARY KEY,   -- client-generated UUID
  merchant          TEXT NOT NULL,
  amount_cents      INTEGER NOT NULL,   -- integer cents, never a float
  gst_cents         INTEGER,
  purchase_date     TEXT NOT NULL,      -- ISO 'YYYY-MM-DD'
  financial_year    INTEGER NOT NULL,   -- FY start year: 2026 means 2026–27
  category_id       TEXT NOT NULL,
  work_use_percent  INTEGER NOT NULL DEFAULT 100,
  notes             TEXT,
  photo_uri         TEXT,               -- file:// path in app documents dir
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,      -- sync: conflict resolution
  deleted_at        TEXT,               -- sync: soft-delete tombstone
  server_id         TEXT,               -- sync: Firestore doc id, null until synced
  sync_state        TEXT NOT NULL       -- 'pending' | 'synced'
);

CREATE INDEX idx_receipts_fy ON receipts (financial_year, deleted_at);
CREATE INDEX idx_receipts_category ON receipts (category_id);
```

`wfh_logs` (date, hours, fy) and `vehicle_trips` (date, km, purpose, vehicle_label, fy) follow the same shape and carry the same five trailing sync columns.

**Three decisions that matter later:**

1. **Money as integer cents.** Never floats. `$49.95` is `4995`. Float arithmetic on currency produces wrong totals, and this is a tax app.
2. **`financial_year` is a stored, indexed column,** not derived at query time. It's the primary filter in almost every screen.
3. **Sync columns exist from day one,** even though nothing reads them until §8. Adding `updated_at` / tombstones to a table already full of user receipts is a migration; including them now costs nothing.

**Photos are stored as file URIs, not blobs.** Images go in the app documents directory; SQLite stores the path. Blobs would bloat the database and make the eventual Firebase Storage upload awkward.

---

## 5. Financial-year module

A small pure-TypeScript module (`src/lib/financialYear.ts`) — no React, no database, no I/O:

- `fyStartYear(date)` → `2026` (Australian FY runs 1 July – 30 June, so July onward belongs to the year it starts in)
- `fyLabel(2026)` → `"2026–27"`
- `fyBounds(2026)` → `{ start: '2026-07-01', end: '2027-06-30' }`
- `currentFy()`

This is used by nearly every screen, every query, and both calculators. **It should be the most thoroughly tested code in the app** — the boundary cases (30 June vs 1 July, leap years, timezone handling on dates near midnight) are exactly where a silent bug puts a receipt in the wrong tax year.

Store dates as plain `YYYY-MM-DD` strings, not timestamps, to sidestep timezone drift entirely.

---

## 6. ATO rules layer ⚠️

**The single most important design point in this document.**

The cents-per-km rate, the WFH fixed rate and the $300 threshold all change between financial years. Hardcoding them inline means a wrong claim amount for every user the year a rate changes. They live in **one file, keyed by financial year** — `src/config/atoRates.ts` — and calculator logic reads from it, never embeds a number.

```ts
export interface FyRates {
  wfhCentsPerHour: number | null;      // null = not yet published/confirmed
  centsPerKm: number | null;
  kmCapPerCar: number;
  noReceiptThresholdCents: number;
}

export const ATO_RATES: Record<number, FyRates> = { /* keyed by FY start year */ };
```

### Rates as researched (July 2026)

| Rule | Value | Status |
| --- | --- | --- |
| Cents per km — **2026–27** | **91c/km** (89c base + a one-off 2c uplift for 2026–27) | ✅ Confirmed |
| Cents per km — 2024–25 & 2025–26 | **88c/km** | ✅ Confirmed |
| Cents per km — cap | **5,000 km per car, per year** | ✅ Confirmed |
| WFH fixed rate — 2024–25 & 2025–26 | **70c per work hour** | ✅ Confirmed |
| WFH fixed rate — **2026–27** | — | ❌ **UNCONFIRMED — must verify before shipping** |
| No-receipt threshold | Written evidence not required if total work-related claims are **≤ $300** — but you must still be able to show how the claim was worked out | ✅ Confirmed, long-standing |

**The 2026–27 WFH rate could not be verified.** `ato.gov.au` returns HTTP 403 to automated requests, and search results only listed published rates through 2025–26. It is recorded as `null` rather than carrying a guessed number into a tax app. **A human must confirm it against ato.gov.au and fill it in.**

The UI must handle `null` gracefully: if a rate for the active FY is missing, the calculator shows "rate not yet available for 2026–27" rather than silently computing with a stale prior-year figure.

### The $300 nudge

Fires when a user's total work-related claims for the FY approach or cross $300 — the point at which written evidence becomes mandatory. Worth wording carefully: the threshold is about *evidence requirements*, not a cap on what can be claimed. Phrasing it as "you can claim $300 without receipts" is a common and costly misreading.

### Disclaimer

TaxTrack is a record-keeping tool, **not tax advice**. This must appear in three places:

1. First-run onboarding screen
2. Settings screen (permanently accessible)
3. Footer of every CSV and PDF export

---

## 7. Screens

Kept deliberately tight — this is an MVP.

| Screen | Contents |
| --- | --- |
| **Dashboard** | Active FY selector, total claimed, running totals by category, $300 threshold nudge |
| **Receipt list** | Filtered by FY, searchable, grouped by category |
| **Add/edit receipt** | Merchant, amount, date, category dropdown, work-use %, notes, camera/library photo attach |
| **WFH calculator** | Log hours by date; outputs the claimable figure for the FY |
| **Vehicle calculator** | Log trips by km + purpose; applies rate and 5,000 km cap; outputs claimable figure |
| **Settings / export** | CSV + PDF export, disclaimer, (later) account & sync status |

---

## 8. Export

- **CSV** — one row per receipt: date, merchant, category, amount, GST, work-use %, notes. This is the format an accountant actually wants, and it maps onto myTax entry.
- **PDF** — an HTML summary rendered via `expo-print`: FY totals by category, calculator outputs, disclaimer footer. Presentation, not data.

Both handed off through `expo-sharing` (email, AirDrop, Files).

---

## 9. Firebase sync — final milestone

Deliberately last. The app must be complete and useful before an account is ever required.

- **Auth:** Firebase Auth, email/password to start. Anonymous auth first, upgraded on sign-up, so a user who's been entering receipts locally doesn't lose them when they create an account.
- **Firestore layout:** `users/{uid}/receipts/{id}`, `users/{uid}/wfhLogs/{id}`, `users/{uid}/vehicleTrips/{id}`.
- **Storage layout:** `users/{uid}/receipts/{receiptId}.jpg`.
- **Sync strategy:** last-write-wins on `updated_at`, with tombstones for deletes. Not sophisticated — but for a single-user-single-device MVP the conflict surface is genuinely tiny, and anything cleverer is premature.
- **Security rules:** users can read/write only their own `users/{uid}/**` subtree. This is the one piece that must not be rushed — the default rules are wide open, and this app holds financial records. Budget real time for rules plus testing them.

### ⚠️ Expo Go constraint — decide this before writing sync code

`@react-native-firebase/*` uses native modules and **does not work in Expo Go** — adopting it forces a development build, which on this machine means installing full Xcode (~10 GB) and/or the Android SDK.

The **Firebase JS SDK** (`firebase` on npm) is pure JavaScript and runs fine in Expo Go. Use it. Everything Phase 1 needs — Auth, Firestore, Storage — is covered, and it keeps the QR-scan development loop intact all the way to the end of Phase 1.

*(Verify current Expo SDK compatibility notes when starting this milestone — this constraint is stable but the specifics move between SDK versions.)*

---

## 10. Testing

Proportionate for an MVP. Two things carry real risk, and they get real tests:

1. **`financialYear.ts`** — boundary dates (30 June / 1 July), FY labels, `currentFy()`.
2. **Calculators and the rates config** — WFH hours × rate, km × rate, the 5,000 km cap, the $300 threshold, and correct behaviour when a rate is `null`.

Both are pure functions with no I/O — fast, cheap, and exactly where a bug costs a user money.

UI gets manual testing on-device via Expo Go. Component and E2E tests are not worth the setup cost at this stage.

---

## 11. Milestones

| # | Milestone | Done when |
| --- | --- | --- |
| 0 | Install Node | `node -v` works |
| 1 | Scaffold Expo app + Expo Router | Blank app loads on phone via Expo Go |
| 2 | FY module + rates config + unit tests | Tests green |
| 3 | SQLite schema + repository layer | Can save and read a receipt |
| 4 | Add/edit receipt + camera capture | Receipt with photo persists across restart |
| 5 | Receipt list + dashboard totals + $300 nudge | Totals correct against hand-calculated fixtures |
| 6 | WFH + vehicle calculators | Outputs match ATO published examples |
| 7 | CSV + PDF export | File opens correctly in Numbers/Preview |
| 8 | Firebase auth + sync + security rules | Receipts survive a fresh install and re-login |

**Validation checkpoint:** milestone 7 is a genuinely shippable app. Worth putting it in front of real users before committing to milestone 8 — the pitch's ask is to "validate with real users this financial year," and sync is the most expensive remaining piece.

---

## 12. Open questions

1. **The 2026–27 WFH fixed rate is unconfirmed** (§6) and must be verified against ato.gov.au before the calculator ships.
2. **Monetisation** — carried over from the pitch: subscription vs one-off unlock, and how price-sensitive a casual PAYG employee is. Doesn't block Phase 1; free tier is all of Phase 1 either way.
3. **Category list** — the ATO category dropdown needs a final list agreed up front, since it's baked into the schema as seed data and changing it later means migrating existing receipts.
