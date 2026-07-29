# TAXTRACK

*A financial-year receipt & deduction tracker for Australian taxpayers*

## 1. The Problem

Every financial year, Australians lose legitimate tax deductions because receipts get lost, categories get forgotten, and record-keeping only happens in a panic during the last week of June. The ATO's own free tool, myDeductions, exists to solve this — but it's a passive record-keeper, not a helpful one.

It requires everything to be typed in and categorised by hand, gives no visibility into spending trends or refund impact, has no budgeting layer, and treats every user the same regardless of occupation. It solves storage, not the behaviour that causes people to under-claim in the first place.

## 2. Existing Market

The market splits into three tiers:

- **Free/government baseline:** ATO myDeductions — official, free, but manual-entry only, no insights.
- **Consumer receipt-scanning apps:** ReceiptClaimer, Crunchr, myBAS myTax — AI/OCR scanning, GST extraction, some occupation guidance, roughly $9–10/month for unlimited use.
- **Full accounting platforms:** TaxTank, Hnry, Sole, Etax, Expensify, Hubdoc — built for sole traders, investors or multi-entity finances; more powerful but more complex and priced for that complexity.

The gap sits between the first two tiers: nobody has combined effortless capture with genuinely useful, occupation-aware guidance and a reconciliation safety net, in a way that's built specifically for the average PAYG Australian employee rather than a freelancer or investor.

## 3. Where We Win: Pain Points → Differentiation

| Pain point (myDeductions & co.) | Why it happens | Our answer |
| --- | --- | --- |
| Manual entry is tedious; people give up mid-year. | myDeductions has no smart capture; scanning apps that do exist are priced for small business, not casual individual use. | Fast manual capture in v1, camera-based OCR capture in v2, priced for individuals, not businesses. |
| No visibility into spending trends or refund impact. | Government tool is a filing cabinet, not a coach. | Running category totals and a live 'deduction pace vs last year' view — turns record-keeping into feedback, not a chore. |
| One-size-fits-all categories. | Nobody tailors guidance by occupation at the individual level. | Occupation-based deduction checklists (nurse, teacher, tradie, office worker) sourced from real ATO occupation guides. |
| WFH hours and vehicle logbooks are clunky everywhere. | Existing tools treat these as generic diary fields, not calculators. | Purpose-built WFH-hours and cents-per-km calculators that output the final claimable number, not just raw entries. |
| Forgotten receipts surface only at tax time, too late to fix. | No tool reconciles what you actually spent against what you've recorded, during the year. | Long-term: bank-feed reconciliation flags deductible-looking transactions with no matching receipt before EOFY. |

## 4. Phased Build Plan

### Phase 1 — MVP (solo-buildable, no AI/ML)

Goal: beat myDeductions on usability alone. No exotic tech, ships fastest, validates demand.

| Feature | Feasibility | Differentiation value |
| --- | --- | --- |
| Manual receipt entry + photo attach | Easy | Baseline parity |
| ATO-category dropdown at entry | Easy | Cleaner than myDeductions' flow |
| Automatic financial-year (Jul–Jun) buckets | Easy | Fixes a real UX gap in generic expense apps |
| Running totals by category | Easy | First taste of 'insight, not just storage' |
| Export to PDF/CSV for accountant or myTax | Easy | High practical value, low build cost |
| $300 no-receipt threshold nudge | Easy | Proactive, ATO-rule-aware guidance |
| Cloud backup/sync via Firebase | Easy (managed service) | Removes 'lost my receipts' fear |

### Phase 2 — Differentiation layer (still solo-feasible)

| Feature | Feasibility | Differentiation value |
| --- | --- | --- |
| Occupation-based deduction checklists | Medium (content curation, not code) | Core differentiator vs every competitor |
| Vehicle logbook calculator (cents-per-km) | Medium | Turns a chore into an automatic number |
| WFH hours calculator (fixed-rate method) | Medium | Same — real ATO method, done for the user |
| EOFY reminders / nudges | Easy | Behavioural hook competitors don't emphasise |

### Phase 3 — Long-term / needs funding or a technical co-founder

| Feature | Feasibility | Differentiation value |
| --- | --- | --- |
| OCR receipt scanning (auto-extract merchant, GST) | Hard — paid API integration | Matches top-tier competitors (ReceiptClaimer, Crunchr) |
| Bank feed reconciliation (open banking API) | Hard — regulatory & security overhead | Closes the 'forgotten receipt' gap nobody else has solved well |
| Multi-year asset depreciation tracking | Hard — real accounting logic | Needed to serve users with laptops/tools/equipment |
| Refund estimation engine | Hard — tax calculation accuracy/liability risk | High demand, high risk if done wrong; needs accountant sign-off |

## 5. Monetisation (undecided — options on the table)

Freemium is the market norm here — ReceiptClaimer already validates the pattern in this exact category:

- **Free tier:** manual entry, categorisation, FY totals, export (all of Phase 1).
- **Paid tier (~$5–10/month, matching category pricing):** OCR scanning, vehicle/WFH calculators, unlimited storage, once we reach Phase 2–3.

Open question for discussion: subscription vs one-off unlock, and how price-sensitive our target user (casual PAYG employee) is versus a sole trader who'll pay more readily.

## 6. Why Now, Why Us

- The government tool is free but deliberately basic — it's not trying to compete on UX.
- The paid competitors that do compete on UX are priced and positioned for small business, not everyday employees.
- A lean MVP is realistically buildable by two motivated people using modern AI-assisted development tools, without needing to raise money first.

The ask: build Phase 1 together, validate with real users this financial year, then decide together whether to invest in Phase 2/3.
