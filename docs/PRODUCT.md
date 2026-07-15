# Tea Factory Ops — Product & Domain Guide

This is the orientation document: what we are building, for whom, and the tea-factory
domain knowledge the software encodes. Read this before [MILESTONES.md](../MILESTONES.md)
(the build plan). If you are an AI agent working on this repo, treat this file as
ground truth for product intent.

## The idea in one paragraph

Phase 1 is an ERP for Sri Lankan bought-leaf tea factories: green-leaf intake,
supplier payments, production (out-turn) tracking, and grading — replacing paper
books. Phase 2 turns the network of onboarded factories and their supplier books
into a two-sided leaf marketplace: suppliers/estate owners and factories discover
each other by area, price, and quality, and leaf quality becomes a score and a
price signal instead of a binary accept/reject at the factory gate. The ERP is
the wedge; the marketplace is the prize.

**June 2026 re-sequencing — auction first.** Within Phase 1, the **Colombo tea
auction & settlement flow is now the immediate wedge** and ships before the
production/grading modules: the factory already runs leaf collection and payments
on an existing system, but had *no* system for the auction (just broker PDFs and a
bank statement reconciled by hand). See "The Colombo auction & settlement flow"
below and the A-track in [MILESTONES.md](../MILESTONES.md).

## Who uses what (personas & devices)

| Persona | Where they work | Device | Interface |
|---|---|---|---|
| Factory owner | Office | Desktop | Web app, full access incl. user management |
| Manager | Office / factory floor | Desktop | Web app, full access except user management |
| Collector / weighing clerk (`collector` role) | Desk at the factory gate | Desktop | Web app, **restricted**: weighing entry + own records only |
| Estate owner / leaf supplier | In the field | Phone | Mobile field app (**Phase 2**) |
| Platform admin | — | Desktop | Admin panel (**Phase 2**) |

**The reality check that shaped this (June 2026, customer zero):** collectors do
not use phones on the job. Leaf bags arrive at the factory, are weighed at the
gate, and a person at a desktop enters the records. So the *web* app carries the
collector workflow (a restricted interface), and the mobile app is repositioned
for the people who genuinely are in the field — estate owners and suppliers — in
Phase 2. The mobile app built in M4 is parked and will be repurposed for them.

## Factory domain walkthrough

What happens to a leaf in a bought-leaf factory, and what we record at each step.
Stages 1 and 10 exist in the schema today; **stage 8 (the auction & settlement
flow) now ships first** in the A-track (see below); the rest arrive with the
deferred M7–M9.

1. **Green-leaf intake** — suppliers (smallholders/estates) deliver leaf, either
   via a collector's lorry route or directly. Bags are weighed at the gate and
   recorded against the supplier (tables: `suppliers`, `collectors`, `weighings`).
2. **Withering** — leaf is spread in troughs with forced airflow for hours,
   losing moisture.
3. **Rolling** — withered leaf goes to the rolling room; rollers break the leaf
   cells.
4. **Fermentation** (oxidation) — rolled leaf oxidizes; time/temperature matter.
5. **Drying** — the "big burner" dryer fires the leaf into **made tea** (dried
   bulk). The dried bulk is weighed.
6. **Out-turn** — the headline production metric:
   `out-turn % = made-tea kg ÷ green-leaf kg charged into the batch`.
   Roughly 20–24% is typical; the exact baseline is per-factory. A low out-turn
   against baseline means excess water in the leaf (rain-wet leaf, or suppliers
   deliberately watering bags to inflate weight) or coarse/poor leaf. Tracking
   out-turn per batch/day and correlating it with which suppliers' leaf went in
   is how the factory detects watered leaf and builds a supplier quality signal.
   ⚠️ **Attribution caveat:** a drying batch mixes many suppliers' leaf, so
   per-supplier out-turn must be inferred statistically (days dominated by one
   route, moving averages per supplier mix) — this is an explicit design problem
   in M7, not a per-bag measurement.
7. **Sifting / grading** — made tea is sorted into grades: Pekoe, Pekoe 1, BOP,
   BOPF, FBOP, OP, Dust 1, Dust… (the catalog varies; keep it configurable per
   factory). A higher share of primary grades means better leaf went in — the
   second supplier-quality signal.
8. **Lots & dispatch** — graded tea is packed into lots and sold (auction,
   brokers, or direct buyers).
9. **Accounts** (future module) — expenses, sales, P&L on top of the operational
   data. Out of scope until Phase 1 stabilizes.
10. **Supplier payments** — monthly: (rate + quality-tier bonus) × kg (exact
    formula to be confirmed with customer zero in M6). The killer feature for
    factories.

## The Colombo auction & settlement flow (the current wedge — A-track)

How a factory's made tea becomes money, and the paper trail the software replaces.
Tea is sold through a **broker** (e.g. BPML Produce Marketing) at the weekly
Colombo auction. A factory sells under one or more **estate marks** (e.g.
`MF1530 KUMUDU`, `MF1530A ITTAPANA`). The lifecycle, with the document each step
produces (all real, from sample Sale `2026-023`):

1. **Invoice & dispatch** — the factory invoices its graded lots and sends them to
   the broker's warehouse. A lot = N bags × kg/bag (e.g. `10B @ 28` = 280 kg).
2. **Acknowledgement** *(broker PDF)* — the broker confirms receipt and
   **catalogues** each lot, mapping the factory **invoice no.** → a **catalogue lot
   no.** Lots that miss the sale (late, over the storage norm) are listed as
   **shutout / violation** — stock left at the warehouse that rolls to the next
   sale.
3. **Valuation** *(broker PDF)* — the broker values each lot with a **price-per-kg
   range** (e.g. `1350–1400/=`), projected proceeds, and a tasting note ("Grayish,
   mixed with short particles") — quality feedback that links back to grading.
4. **Auction sale + Sellers Contract & Account Sales** *(broker PDF)* — per lot:
   buyer (+ VAT no.), **actual price/kg**, proceeds, **VAT @ 18%**, and a **Bank
   Guarantee** flag. **VAT is collected from buyers on the seller's behalf**; the
   factory must remit it to the government. Per lot the VAT is either **paid
   up-front in cash (`Bank Guarantee = NO`)** or **deferred, secured by a bank
   guarantee (`Bank Guarantee = YES`)** — realised later when the guarantee is
   honoured. The same document carries the **deduction stack** (insurance,
   brokerage %, handling/kg, documentation/lot, e-platform/kg, public sale ex.,
   govt relief loan, plus the broker's own VAT on those charges) → **Net Proceeds**
   → **Total Net Proceeds**, payable on the **prompt date**.
5. **Cash settlement** *(bank statement CSV)* — the broker pays Total Net Proceeds
   to the factory's bank account on/after the prompt date.

**The four reconciliations are the product** (each a concrete, testable
calculation): ① invoice ↔ acknowledgement (catch shutouts & weight deltas); ②
valuation ↔ actual sale price (below/within/above range, realised premium); ③ VAT
split (cash vs guarantee) + net VAT payable to government (output − input); ④
settlement Total Net Proceeds ↔ bank credit + cheque reconciliation. **Full spec —
state machine, data model, PDF ingestion, and contract math worked to the cent:
[docs/AUCTION.md](AUCTION.md).** Sample docs live in
`~/Desktop/custo-tokanizer-onix/ktf-auc-fll`.

## Quality-tier pricing — the "superleaf" concept (M6)

Customer zero already pays for quality: best-leaf suppliers get ~Rs 20/kg extra
on a ~Rs 200 base, and poor-leaf suppliers get ~20 rupees or ~20% cut. The cut
is the problem — **loss aversion**: a deduction from "their" 200 feels like
theft and pushes suppliers to a flat-rate competitor, while the identical math
expressed as a bonus feels like a reward. The ERP encodes the smarter framing:

- **Bonuses only, never deductions.** Publish a slightly lower base and let
  every tier *add*: e.g. base 185, Standard +15 (= the familiar 200 most
  suppliers get), **Superleaf +35 (= 220)**. Poor leaf simply earns no bonus —
  nobody sees a minus sign on their statement. The base, tier names, and bonus
  amounts are **owner-editable settings** (effective-dated), never hardcoded.
- **Rolling assignment with warnings.** Tier moves on a 4–8 week pattern, not
  per delivery — one rain-soaked bag doesn't slash a month, and a downgrade is
  never a surprise.
- **Show the missed bonus.** Statements print "Superleaf grade would have
  earned you Rs X more this month" — motivation without punishment.
- **Evidence-backed tiers.** Per-delivery quality notes now; out-turn % (M7)
  and grade-mix (M8) later make tier assignment objective and defensible —
  "your batches dry at 19% vs our 22% baseline" ends the argument that "your
  leaf looks watery" starts.

This is also Phase 2 groundwork: superleaf tiers are a factory-level
forerunner of the marketplace-wide supplier quality score.

## Supplier quality signals (the bridge to Phase 2)

Each ERP feature quietly accumulates the data that powers marketplace quality
scores later:

| Signal | Source | Milestone |
|---|---|---|
| Quality tier ("superleaf") | Factory-assigned tier, per-delivery notes | M6 |
| Water/weight inflation detection | Out-turn vs baseline, correlated to supplier mix | M7 |
| Leaf quality from grade mix | Share of primary grades per period vs supplier mix | M8 |
| Acceptance rate across factories | Accept/reject/downgrade per delivery | Phase 2 |
| Photo/ML leaf grading | Rated delivery photos | Research spike, unscheduled |

## Multi-tenancy architecture (one database, zero leaks)

Many factories share one Postgres (Supabase). Tenancy rules are **non-negotiable**:

- The tenant boundary is a `factories` row. **Every** domain table carries
  `factory_id` (indexed). Onboarding a new factory = inserting one row and an
  owner user — today via script, from M11 behind a public signup + subscription
  checkout so owners self-serve.
- **Row Level Security on every table, in the same migration that creates it.**
  The standard policy compares `factory_id` to `current_factory_id()` — a
  `SECURITY DEFINER` lookup of the logged-in user's factory (definer needed to
  avoid recursion on the `users` table policy). Policies target the
  `authenticated` role and include `WITH CHECK` so rows can't be written into
  another tenant.
- Client apps (web browser bundle, mobile) only ever hold the **publishable**
  key + the user's JWT. The **secret key** lives server-side only (Next.js
  server actions, provisioning scripts) — it bypasses RLS, so it never ships to
  a client. `NEXT_PUBLIC_`/`EXPO_PUBLIC_` prefixes are the exposure boundary.
- App-level role checks (`apps/web/lib/roles.ts`) control *which screens* a role
  sees; RLS controls *which rows* exist for them. Both layers must hold.
- After `requireProfile` resolves the signed-in actor, all web server reads and
  writes pass through `apps/web/lib/tenant-data.ts`. Its allowlisted table
  boundary injects `factory_id` on inserts/upserts and applies the factory
  predicate to selects, updates, and deletes. This is defense in depth above
  RLS; entity actions still own role checks and domain validation. Never accept
  a table name from a browser request.
- Entity delete actions use `deleteTenantRow`. Foreign-key behavior stays in the
  database schema: restrictive relationships reject deletion with a friendly
  message naming the dependent record type, while an explicitly declared
  `ON DELETE CASCADE` removes child records atomically. Do not implement a
  browser-controlled generic cascade option.
- Verification gates `db:verify-rls` and `db:verify-auth` must pass after any
  schema or policy change.
- Phase 2 note: marketplace entities (supplier accounts, listings) are
  *cross-tenant by design*. Their policies will be relationship-scoped
  (supplier ↔ factory links) instead of factory-scoped — a deliberate, reviewed
  change in the Phase 2 milestones, never an implicit one.

## Modular architecture (how features get added)

The system grows module by module. A module = schema + policies + routes + a
role-gated nav entry.

Current and planned modules:

| Module | Schema (packages/db/src/schema) | Web routes (apps/web/app/dashboard) | Status |
|---|---|---|---|
| Intake | `suppliers.ts`, `collectors.ts`, `weighings.ts` | `/suppliers`, `/collectors`, `/weighings` | ✅ M3 |
| People & access | `users.ts` | `/users` | ✅ M5 |
| Payments | `price-rates.ts`, `payments.ts` | `/payments` (M6) | schema only |
| Production (out-turn) | `batches.ts` etc. (M7) | `/production` (M7) | planned |
| Sifting & grades | `grades.ts` etc. (M8) | `/grades` (M8) | planned |
| Lots, deliveries & sales | `lots.ts`, sales/dispatch (M9) | `/lots`, `/sales` (M9) | planned |
| Accounts | `expenses.ts` etc. (M10) | `/accounting` (M10) | planned (Phase 1) |
| Marketplace | (Phase 2) | separate surface | Phase 2 |

### Sellable modules (subscription entitlements)

Modules aren't just code organization — they're **what a factory buys**. A
factory's subscription determines its enabled module set; anything not
purchased is invisible to every user of that factory (nav, pages, and server
actions all gate on it). Access is therefore two-dimensional:
**role** (who you are in the factory) ∩ **entitlement** (what the factory pays for).

| Sellable bundle | Modules included | Entitlement key |
|---|---|---|
| Board-leaf handling (base) | Intake (suppliers, collectors, weighings) + People & access + Payments/superleaf | `leaf-handling` |
| Auction & settlement | Auction intake/cataloguing (A1), valuation & sale (A2), VAT/deductions/settlement (A3) | `auction` |
| Production & sales | Out-turn (M7), Sifting & grades (M8), Lots/deliveries/sales (M9) | `production` |
| Accounting | Bank/cheque reconciliation (A4), Accounts / P&L (M10) | `accounts` |
| Marketplace / premium intelligence | Phase 2 surfaces | Phase 2 keys |

(Exact bundle boundaries are a business decision; the keys are the stable
mechanism — re-grouping modules into different bundles is config in
`lib/roles.ts`, not a code change.)

Bundle composition is a business decision and must stay cheap to change — the
mechanism is per-module keys, so re-bundling is config, not code. Mechanism:
`factories` carries the enabled module set (written by the M11 subscription
checkout; until then, customer zero has everything enabled); each `MODULES`
entry in `apps/web/lib/roles.ts` declares its entitlement key; the gates check
both dimensions. Enforcement code lands with M11 — but every module shipped
before then must already declare its key so flipping enforcement on is trivial.

**Checklist for adding a module:**
1. Schema file under `packages/db/src/schema/<module>.ts`, exported from
   `index.ts`; migration includes `factory_id`, index, **and RLS policy**.
2. Route group `apps/web/app/dashboard/<module>/` — `page.tsx`, `actions.ts`,
   forms colocated. Server actions start with a `requireProfile([...roles])` gate.
3. Nav + access entry in `apps/web/lib/roles.ts` (`MODULES`) — the single source
   of truth for which roles see which module — **including its entitlement key**
   (which sellable bundle it belongs to).
4. Verification gate in MILESTONES.md; `db:verify-rls` still passes.

Workspace layout: `apps/web` (Next.js 15 — the ERP), `apps/mobile` (Expo —
parked, becomes the Phase 2 field app), `packages/db` (Drizzle schema +
migrations + ops scripts), `packages/api` (tRPC, first used in M6 payments),
`packages/ui` (when shared UI emerges).

## Where things stand

See [MILESTONES.md](../MILESTONES.md) for the live plan and what's done.
