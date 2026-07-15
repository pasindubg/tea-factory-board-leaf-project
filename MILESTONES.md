# Tea Factory Ops — Milestone Plan

Each milestone is independently shippable and has a concrete verification gate.
Do not start milestone N+1 until N's gate passes.

Product vision, personas, the tea-production domain (withering → rolling →
fermentation → drying → out-turn → grades), multi-tenancy rules, and the modular
architecture conventions live in **[docs/PRODUCT.md](docs/PRODUCT.md)** — read
that first.

> **Re-planned June 2026.** Two reorderings after customer-zero feedback:
> (1) collectors work at a desktop at the factory gate, not on phones — the
> collector interface moved into the web app (M5); the M4 mobile app is parked
> and becomes the Phase 2 *field* app for estate owners/suppliers, taking
> offline sync with it (the factory desktop has connectivity; the field
> doesn't). (2) **Finish the entire factory ERP before Phase 2.** Phase 1 now
> runs the full physical-to-financial loop: leaf collection (done) → payments &
> superleaf (M6) → production/out-turn (M7) → sifting & grades (M8) → lots,
> deliveries & auction/buyer sales (M9) → accounting/P&L (M10) → deploy &
> self-serve onboarding (M11). Accounting was promoted out of the backlog;
> sales/deliveries became their own milestone. The marketplace (M12–M17) comes
> only after the ERP is complete — and M7/M8 quietly build the supplier-quality
> dataset it will monetize.

---

# Phase 1 — Factory ERP

## M0 — Monorepo scaffold ✅
Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`,
workspace packages (`apps/web`, `apps/mobile`, `packages/db`, `packages/api`,
`packages/ui`), shared lint/TS config, `.env.example`, git init.

**Verify:** `pnpm install` and `pnpm turbo build` succeed from a clean clone. ✅

## M1 — Database + multi-tenancy ✅
Supabase project. Drizzle schema for all tables (`numeric` for weights/money).
RLS factory-isolation policies on every table. Seed: 2 factories, users in each
role, suppliers, sample weighings.

**Verify:** factory A's owner sees only factory A rows; factory B likewise;
anonymous sees nothing (`db:verify-rls`). ✅

## M2 — Auth + app shells ✅
Supabase Auth email OTP (no self-signup). Next.js login → authenticated
dashboard shell; `factory_id` and `role` resolved on login.

**Verify:** `db:verify-auth` passes. ✅

## M3 — Web dashboard core ✅ (customer zero live)
Suppliers CRUD, collectors CRUD, weighing entry, weighings list with filters,
overview dashboard (today's intake, by collector, 7-day chart).

**Verify:** owner records a weighing and sees it in the day's totals with no
developer involvement. ✅

## M4 — Mobile app ✅ (built, parked → Phase 2 field app)
Built as an online-only Expo collector app (login, today summary, weigh form,
records). **Customer-zero feedback then revealed collectors are desktop users**,
so this app is parked, not shipped. The code (`apps/mobile`) is kept and will be
repurposed for field users — estate owners/suppliers — in Phase 2 (M11). Useful
regardless: client-generated UUID pattern proven, Expo toolchain set up.

## M5 — User management & role-based web access ⬅ CURRENT
The web app becomes the single surface for all factory staff:

- **Users page (owner only):** list users; add a user (creates the Supabase auth
  account — no self-signup — plus the profile row); deactivate/reactivate
  (auth-level ban + app-level `active` check); remove (deletes login, keeps
  historical records intact).
- Adding a `collector`-role user auto-creates a linked `collectors` record so
  their weighings attribute correctly.
- **Restricted collector web UI:** collector logs in on web and gets *only*
  weighing entry + their own records (pinned to their collector identity). No
  suppliers/collectors/users/overview access.
- Role → module access defined once in `apps/web/lib/roles.ts` (see modular
  conventions in PRODUCT.md).

**Verify:** owner adds a collector-role user; that user signs in and sees only
Weighings, records one pinned to their own collector id; a deactivated user is
locked out; a removed user can't sign in; `db:verify-rls` still passes.

## M6 — Payments (the killer feature) ✅ built & verified
⚠️ Numbers used so far are illustrative — **confirm the real payment formula and
calibrate base/bonus/deduction values with customer zero** before a live month.
Built: deduction line-items (advances, transport, water penalty, ad-hoc),
quality tiers supporting flat-LKR or %-of-base bonuses, effective-dated manual
tier assignment (with a `source` field so M7/M8 auto-scoring can write later),
the pure calc engine in `packages/api` (fixture-tested to the cent across a
mid-month rate AND tier change), and per-supplier statements with the
"bonus missed" figure. Calc runs in a server action over the shared engine
rather than full tRPC transport (App Router idiom; engine stays testable).

- Settings page: manage rates (effective-from dates)
- **Quality-tier pricing ("superleaf"):** per-factory tiers with per-kg bonus
  modifiers (e.g. base 185, Standard +15, Superleaf +35), per-supplier tier
  assignment with effective dates and a reason/history log. **The base rate,
  the tier names, and every bonus amount are owner-editable settings**
  (effective-dated, like rates) — the numbers here are illustrative defaults,
  never hardcoded. **Always framed as bonuses on a base rate, never
  deductions** — see the superleaf section in PRODUCT.md for why. Tier moves
  on a rolling pattern with warnings, not per delivery. Statements show the
  bonus earned and the bonus *missed*.
- Monthly calculation as a server-side tRPC procedure (first real tRPC use):
  per supplier, sum kg × (rate + tier bonus) effective at each weighing's
  collection date
- Payments page: generate a month, review per-supplier statements, mark paid
- Printable per-supplier statement (base, bonus, and "missed bonus" lines)

**Verify:** fixture test — known weighings spanning a mid-month rate change AND
a mid-month tier change produce hand-calculated totals to the cent. Run a real
month in parallel with the factory's books and reconcile.

---

# Phase 1 (re-sequenced June 2026) — Auction & Settlement is the new wedge

> **Auction-first pivot (June 2026, customer zero).** The factory already runs
> leaf collection, supplier records and payments on an existing system, but has
> **no system at all** for the Colombo auction flow — today it's broker PDFs
> (Acknowledgement, Valuation, Sellers Contract) landing in email plus a bank
> statement CSV, reconciled by hand. So the **auction & settlement flow ships
> first (A1–A3)** as the new wedge, with **accounting + bank/cheque reconciliation
> as Priority 2 (A4)**. The previously-planned ERP-domain milestones
> (production/out-turn, sifting & grades, lots/deliveries, accounting close,
> deploy) are **deferred to M7–M11** and built when we move to replace the
> factory's existing leaf-collection system, once the auction product is stable
> and validated. Phase 2 marketplace is unchanged in intent.
>
> Specified against real customer data — Sale **2026-023**, sold 17 Jun 2026,
> broker **BPML Produce Marketing**, marks **MF1530 KUMUDU / MF1530A ITTAPANA**.

The flow: **factory invoice → dispatch to warehouse → broker acknowledgement &
cataloguing → valuation → auction sale (VAT paid up-front, or deferred on a bank
guarantee) → account-sales settlement → cash in the bank.** Four reconciliations
are the product:
1. **Invoice ↔ Acknowledgement** — every invoiced lot is catalogued (matching net
   weight) or flagged shutout/violation (stock left at the warehouse, rolls to the
   next sale).
2. **Valuation ↔ Sale** — actual price/kg vs the broker's valuation range, per lot
   and per grade (Sale 023: valued avg 1,518.35 → sold 1,656.70, +9.1%).
3. **VAT split & remittance** — per sold lot, VAT (18% of proceeds) is either
   received in cash up-front (`Bank Guarantee = NO`) or deferred on a bank
   guarantee (`Bank Guarantee = YES`). Track cash-vs-guaranteed balance, guarantee
   realisation, and net VAT payable to govt (output VAT − input VAT incl. the
   broker's VAT on charges). Sale 023: 885,672 total VAT; 166,860 on guarantee
   (lots 0481, 0670); 718,812 cash.
4. **Settlement ↔ Bank** — broker pays Total Net Proceeds on the prompt date
   (Sale 023: 6,032,945.83 due 24 Jun across both contracts); match it to a bank
   credit from the CSV.

Ingestion: the three broker documents arrive as **email PDFs with a clean text
layer** (parse directly, no OCR); the bank statement is a **CSV** downloaded from
the factory's bank. All ingestion uses the same **parse → staging table → review
screen → confirm** pattern so a mis-parse never writes silently. The full feature
spec — state machine, data model, ingestion design, contract math, and the four
reconciliations worked to the cent — lives in **[docs/AUCTION.md](docs/AUCTION.md)**.

## A1 — Auction intake & cataloguing ✅ done & verified  (entitlement `auction`)
Foundations + reconciliation ①. PDF text via `unpdf`; pure parser + reconciler in
`packages/api/src/auction/` (`pnpm --dir packages/api test:auction`). Verified
end-to-end against the real Sale-023 Acknowledgement (fixture tests + a rolled-back
DB integration: 12 catalogued, 2 shutout `0061`/`0063`, inv `0058`→lot `0477`).
- Schema: `brokers`, `marks` (estate marks per factory, e.g. MF1530/MF1530A),
  `sales` (sale no, sale date, prompt date, broker, mark), `lots` (factory invoice
  no, broker lot no, grade, bags, gross/sample/net wt, store/category, state:
  `invoiced → catalogued | shutout`), all with `factory_id` + index + RLS policy
  in the creating migration.
- Factory-side: record the invoice/dispatch (the lots sent to the warehouse).
- PDF ingestion of the Acknowledgement: maps invoice no → lot no, asserts net
  weights, surfaces shutouts/violations.
- Reconciliation ① report: invoiced vs catalogued vs shutout, weight deltas.

**Verify:** ingest the Sale-023 Acknowledgement PDF; all 12 catalogued lots map to
their invoice numbers with exact net weights; invoices 0061 and 0063 show as
shutout; `db:verify-rls` passes.

## A2 — Valuation & auction sale ✅ done & verified  (entitlement `auction`)
Reconciliation ②. Parsers + reconciler in `packages/api/src/auction/`
(`pnpm --dir packages/api test:auction2`, 21 checks). Verified end-to-end against
the real Sale-023 Valuation + Sellers Contract (rolled-back DB integration: 12
valuations, 12 sale lines, 8 buyers, 2 on bank guarantee; KUMUDU realised premium
+9.11%, 1,518.35 → 1,656.70 /kg). Nav split into Leaf Handling / Sales Handling.
- Schema: `valuations` (lot, min/max price/kg, projected proceeds, tasting note),
  `buyers` (name, VAT no.), `sale_lines` (lot, buyer, price/kg, proceeds, vat,
  guarantee flag).
- PDF ingestion of the Valuation Report and the Sellers Contract & Account Sales.
- Reconciliation ② report: actual price/kg vs valuation range (below / within /
  above) per lot, grade and sale; realised premium/discount; tasting note retained
  for the future grades link (deferred M8).

**Verify:** ingest Sale-023 Valuation + Contract; each lot's actual price
classifies against its range; proceeds total 4,920,400 (KUMUDU) + 258,000
(ITTAPANA); realised-vs-valuation variance renders.

## A3 — VAT, deductions & settlement  (entitlement `auction`)
Reconciliation ③.
- Schema: `settlements` (per contract: deduction line-items — insurance, public
  sale ex., brokerage %, handling/kg, documentation/lot, e-platform/kg, govt relief
  loan, VAT-on-charges; net proceeds; total net proceeds), `vat_ledger` (per
  sale_line: VAT amount, mode `cash|guarantee`, realisation date, status, plus a
  flow/source tag), and `broker_rates` — owner-editable, **per-broker** deduction
  rate cards (rates are configurable per broker, never hardcoded).
- Scope: VAT here is **auction-flow only** — output VAT collected from buyers on
  the factory's behalf (cash vs guarantee) + the broker's VAT-on-charges as auction
  input VAT. Other flows (supplier payments, non-auction purchases) stay out now;
  the flow tag lets them join later as separate buckets so the govt return sums
  across flows deliberately. Clean separation of flows is the rule.
- Settlement view reconstructs the Account Sales math to the cent from the broker's
  configured rate card and cross-checks it against the parsed contract values,
  flagging any drift.
- Recon ④ matching tolerates either broker VAT-remittance behaviour: it knows both
  the full Total Net Proceeds and the guaranteed-VAT carve-out, matches the bank
  credit to whichever lands, and labels it (full VAT vs cash-only, guarantee
  pending) — the real behaviour is confirmed from the first observed settlement.
- VAT dashboard: cash VAT collected vs VAT outstanding on guarantee; guarantees
  due/overdue; net VAT payable to govt for the period.

**Verify:** Sale-023 settlement reproduces Total Net Proceeds 5,733,046.98 /
299,898.85 from parsed lines; VAT split shows 718,812 cash / 166,860 guaranteed;
the net VAT-payable figure computes.

> **Dispatch-first redesign + resolvers (28 Jun 2026).** The model was corrected to
> be **dispatch-first** (the factory dispatches lots to a 3rd-party store; the broker
> catalogues a *partial* subset): lot state `invoiced`→`dispatched`, new states
> `pending` (absent from this ack) / `re-print` (unsold→rolls forward) / `missing`
> (explicit mark); `lot_invoices` child table for 1-lot→many-invoices (migration
> 0014). Added: **orphan-resolver Compare panel** on recon ① (link a pending invoice
> to an unexpected catalogue lot, scored + audited), **`auction_audit`** table
> (migration 0015), the **bank-recon review UI** below, and a **cross-sale
> dashboard** (`/dashboard/auction/dashboard`). Migration 0012 (settlements etc.) was
> found missing from the live DB and applied. All verified via DB integration +
> tests; uncommitted on `pasindu/auction-flow-reconsiliation`.

## A4 — Accounting integration & bank reconciliation  (Priority 2, entitlement `accounts`)
Reconciliation ④ + the accounting hook.
- Bank statement CSV import (Commercial Bank format) → `bank_txns` (date,
  description, debit, credit, running balance, cheque no). ✅ stage→review→confirm
  (upload on sale detail → review page `[saleId]/bank/[importId]`).
- Reconciliation ④: match expected Total Net Proceeds (by prompt date) to bank
  credits; cheque reconciliation (the many CHEQUE debits/credits); flag unmatched.
  ✅ review UI: per-settlement status (settled / cash-only / under-paid / over-paid /
  awaiting / unpaid) with a prompt-date grace window, auto-match suggestions, and an
  unattributed-credit↔unpaid-settlement resolver (scored on amount/date/narration,
  audited).
- Seed P&L / cash-flow from auction revenue + settlement deductions; leave the
  **hook** to absorb supplier payments (M6), production cost and wider expenses
  when the ERP-domain milestones land — this is where the full accounting system
  later plugs in (cheque reconciliation and bank validation across all activity).

**Verify:** import the provided bank CSV; reconcile a settlement credit (or
correctly report it as not-yet-received, since this statement predates the 24 Jun
prompt date); cheque-matching summary renders; a starter P&L shows auction revenue
net of deductions.

---

# Phase 1 (deferred) — ERP-domain milestones

> Resume after the auction product (A1–A4) is stable and validated — these
> replace the factory's existing leaf-collection system. M9/M10 below now build
> *on top of* the auction & accounting modules shipped in the A-track.

## M7 — Production & out-turn tracking
The factory's manufacturing pipeline (see PRODUCT.md domain walkthrough):
production batches through withering → rolling → fermentation → drying; weigh
the dried bulk; **out-turn % = made tea ÷ green leaf** per batch/day vs the
factory's baseline.

- Batch entity linking a day/shift's green-leaf intake to its dried-bulk output
- Out-turn dashboard: trend vs baseline, low-out-turn alerts
- Supplier water-detection signals: correlate batch out-turn with the supplier
  mix in the batch (statistical attribution — explicit design task, see caveat
  in PRODUCT.md)
- Optional stage data where the factory will actually record it (withering
  hours, moisture observations) — don't force data entry that won't happen

**Verify:** fixture batch produces the hand-calculated out-turn %; a
low-out-turn day flags; a supplier consistently present in low-out-turn batches
trends down in the quality signal.

## M8 — Sifting & grades
- Grade catalog per factory (Pekoe, Pekoe 1, BOP, BOPF, Dust 1, … configurable)
- Sifting outputs: per-batch kg per grade; primary-vs-off-grade ratio
- Supplier quality signal #2: grade-mix correlated to supplier mix over time

**Verify:** a batch's grade outputs sum to its dried bulk (± recorded waste);
grade-mix report renders per period.

## M9 — Lots, deliveries & sales (auction / buyers)
The made tea leaves the factory and becomes revenue. **The auction sale + lot
records already exist from the A-track**; this milestone wires production → grades
→ lots into them (so a lot is composed from real graded out-turn, not entered by
hand) and adds direct-buyer (non-auction) sales:

- Lots: pack graded tea into lots, status transitions (open → processing →
  graded → sold), lot ↔ grade-output composition
- Dispatch / delivery records: lot leaves the factory to a destination
  (Colombo auction via broker, or a direct buyer)
- Sale records: sale price per kg per grade/lot, buyer/broker, sale date,
  proceeds — the revenue side that feeds accounting (M10)
- Buyer/broker registry per factory

**Verify:** a lot is built from grade outputs, dispatched, and sold; lot totals
reconcile to the grade outputs that went in; sale proceeds compute correctly.

## M10 — Accounting (full close)
Extends the A4 accounting/bank-reconciliation base into the full books once
supplier payments and production costs exist — closing the ERP loop:

- Expenses (wages, fuel/firewood for the dryer, transport, packing, overheads)
  with categories; supplier payments (M6) and sales proceeds (M9) flow in
  automatically
- Per-period P&L: revenue (sales) − green-leaf cost (payments) − expenses
- Cost-per-kg-made-tea and margin reporting
- Export for the factory's external accountant / tax filing

**Verify:** a fixture month with known intake, payments, sales, and expenses
produces a hand-calculated P&L to the cent; revenue and leaf cost auto-pull
from M9/M6 without re-entry.

## M11 — Production hardening, deploy & self-serve onboarding
Web on Vercel, Supabase backups confirmed, error reporting (Sentry), runbook in
README. Factory onboarding script (create factory + owner user) — then put it
behind a front door: **public signup page → subscription payment (local
gateway/card) → automated factory + owner provisioning**, so a new factory
owner can buy and start using the ERP without us.

**Subscriptions sell modules, not just access** (see "Sellable modules" in
PRODUCT.md): the factory's plan determines its `enabled_modules` set — e.g.
board-leaf handling only, or + out-turn & sifting, or + accounting. The
`lib/roles.ts` registry gains a per-module entitlement key and the nav/page/
action gates check role ∩ entitlement. A factory that hasn't bought a module
never sees it. This is also the feature-gate hook Phase 2 premium tiers reuse.

**Verify:** customer zero runs a full month — daily collection through payment
generation and a closed P&L — with zero developer intervention. A test
signup → payment → fresh factory dashboard works end to end showing only the
purchased modules, and `db:verify-rls` proves the new tenant is isolated.

## Backlog (Phase 1.x, unscheduled)
- Photo/ML leaf-quality research spike (prototype against rated delivery photos
  once Phase 2 collects them)

---

# Phase 1.5 — AI Insights track (AI1–AI4, entitlement `insights`)

Money-denominated, evidence-backed suggestions computed from the ERP's own
data. Architecture spec: [docs/AI_INSIGHTS.md](docs/AI_INSIGHTS.md);
task-level plan: [docs/AI_INSIGHTS_IMPLEMENTATION.md](docs/AI_INSIGHTS_IMPLEMENTATION.md)
(T1–T23 with exit gates); playbook: `.claude/skills/ai-insights`. Design
principle: deterministic analyzers + rules first (zero LLM tokens); the LLM
only narrates curated evidence packs and synthesizes the weekly digest, under
a per-factory budget with a citation validator blocking invented figures.

## AI1 — Deterministic insight engine (no LLM)
Insights/insight_runs/metric_snapshots/insight_feedback tables (+RLS), analyzer
& rule registries in `packages/api/src/insights`, event hooks after the confirm
actions, 8 launch rules (settlement aging, min-kg/shutout risk, weight
shrinkage, valuation premium by grade, deduction leakage, supply drop, water
penalty repeat, advance overexposure), insights inbox page, row flags + AI note
on Suppliers and Dispatches Overview.

**Verify:** each rule fires on its fixture and stays silent on clean data;
impact LKR matches hand-computed values; ack/dismiss persists; `db:verify-rls`
covers the new tables.

## AI2 — LLM notes + weekly owner digest
Haiku notes for flagged entities; Sonnet weekly digest + cash-flow-week-ahead;
evidence-hash caching; per-factory token budget (cap degrades to rules-only).

**Verify:** digest cites only numbers present in evidence packs; re-run with
unchanged data spends 0 tokens; budget cap halts L3 but never L1/L2.

## AI3 — Agentic drill-down & feedback
Analyzer registry exposed as Claude tools; guarded read-only SQL tool
(SELECT-only role, allowlist, timeouts, caps, full audit); "Analyze now" and
"Ask the analyst"; usefulness feedback + dismiss-rate tuning report.

**Verify:** agent answers scripted owner questions on fixtures with correct
figures; SQL tool refuses writes/oversized/other-tenant queries in tests.

## AI4 — Forecasts & benchmarks (post-M7/M8; Phase-2 synergy)
Grade-price and intake forecasts; leaf→auction quality thread with out-turn
data; consent-gated anonymized cross-factory benchmarks (premium tier).

---

# Phase 2 — Leaf Marketplace & field apps

**Vision:** an Uber-like two-sided marketplace where leaf suppliers / estate
owners and factories / buyers both have accounts. Suppliers list available leaf;
buyers discover suppliers by area and quality; quality becomes a score and a
price signal instead of a binary accept/reject at the factory gate (which today
costs factories the supplier relationship).

**Why Phase 1 first:** the ERP is the wedge. Every factory onboarded brings its
supplier book, seeding the marketplace network. And M7/M8 quietly accumulate the
quality dataset (out-turn, grade mix) that makes supplier scores credible.

**Key architectural shift:** in Phase 1 a supplier is a row owned by one
factory. In Phase 2 a supplier becomes an independent account that can deal with
many factories. M12 makes this migration explicit; everything else builds on it.

## M12 — Supplier identity & accounts
Suppliers become first-class users: new `supplier` auth role, self-signup flow,
supplier profile (location, land size, capacity, photos). Existing factory-owned
supplier rows become *links* (factory ↔ supplier relationships) so Phase 1
factories keep working unchanged; a factory can invite its paper-book suppliers
to claim their account. RLS rework: relationship-scoped policies for these
tables (suppliers see their own data across factories; factories see linked
suppliers). Design the **data-sharing consent model** here — M17's premium
intelligence may only ever surface consented data.

**Verify:** a supplier self-signs up and sees their own delivery/payment history
from a linked factory. Factory dashboards unchanged. RLS gates pass.

## M13 — Mobile field app + offline support
Repurpose `apps/mobile` (built in M4) for field users — suppliers and estate
owners: their deliveries and payment history, leaf availability posting (feeds
M15), factory discovery preview. This is where **offline sync** lands (the old
Phase 1 M5): field connectivity is poor; reads cached locally, writes queued in
an outbox (evaluate expo-sqlite outbox before WatermelonDB; server wins on
conflict; client UUIDs make pushes idempotent).

**Verify:** airplane-mode test — actions queued offline land exactly once after
reconnect, surviving an app kill and a mid-push failure.

> **In progress (issue #13, owner-directed ahead of schedule).** A foundation
> slice of this field app is built: supplier/driver roles + phone-OTP login,
> a server-driven request catalogue, the advance request → web approval (writes
> an M6 deduction) → driver-handover → supplier-acknowledgement trust loop. It
> lives in `apps/mobile` + a new `request_types`/`supplier_requests` schema. See
> **[docs/mobile/](docs/mobile/)** (PRODUCT, ARCHITECTURE, MILESTONES FA0–FA7,
> WALKTHROUGH) for the full plan. Offline sync (the airplane-mode gate above) and
> geo/route optimisation are sequenced as FA5; not in this slice.

## M14 — Geo discovery (maps)
Geocode supplier and factory locations. Factory-side: map + radius search for
suppliers (capacity, quality summary). Supplier-side: nearby factories with
their current price boards.

**Verify:** a factory finds suppliers within X km; a supplier sees nearby
factories and prices.

## M15 — Listings, offers & transactions (marketplace core)
Suppliers post leaf availability (quantity, date, asking price, photos).
Factories publish buy prices / make offers. Accept → transaction record that
flows into the Phase 1 weighing/payment pipeline on delivery.

**Verify:** two test accounts complete listing → offer → accept → delivery →
payment end to end.

## M16 — Quality & trust
Per-delivery quality rating by the factory (moisture, coarse leaf %, photos).
Supplier quality history and score visible to buyers; price differentiation by
grade. Supplier **acceptance-rate grade** across all factories (computable from
delivery records alone — ships first within this milestone). Combine with the
Phase 1 signals (out-turn, grade mix) into one supplier score.

**Verify:** a rated delivery updates the supplier's public score; a rejected
delivery lowers the acceptance rate; buyers can filter discovery by minimum
score.

## M17 — Marketplace operations & monetization
Commission or subscription billing on transactions; SMS/push notifications;
platform admin panel (account verification, dispute handling). **Premium
factory tier:** basic sees a supplier's overall score; premium unlocks detailed
intelligence (acceptance-rate history, per-factory quality breakdown, volume
trends). **Premium supplier tier:** which factories accept leaf from competitor
suppliers and the grades/quality they were given. Both tiers surface **only
consented/shared data** per the consent model designed in M12, feature-gated by
subscription plan.

**Verify:** a completed transaction produces a correct platform fee record;
notifications fire at each step; a basic-plan account cannot see premium
intelligence and an upgraded one can.

---

## Standing rules
- `numeric` for all money/weight columns; never `real`.
- Every domain table carries `factory_id` + index; **every new table gets its
  RLS policy in the same migration**. `db:verify-rls` after schema changes.
- Register every web-accessible tenant table in `apps/web/lib/tenant-data.ts`;
  authenticated server CRUD must use the tenant-scoped client returned by
  `requireProfile`/`requireModuleAccess`, never a client-selected table name.
- Use `deleteTenantRow` for entity delete commands. Keep cascade policy on the
  foreign key (`onDelete: "cascade"` plus its migration); otherwise preserve the
  dependency and surface the shared dependent-record error.
- The repository-wide golden tenant CRUD policy is
  `.agents/skills/tenant-secure-crud/SKILL.md`. Every future database read,
  mutation, import, RPC, list action, and schema change must satisfy that skill's
  implementation and verification checklist before it is considered complete.
- Every record list follows `.agents/skills/list-framework/SKILL.md`: shared
  list surfaces, permission-aware built-in creation, selection-level commands,
  tabs for related lists, and component-local reload through opaque allowlisted
  read resources. Do not add per-entity refresh actions or browser-controlled
  table/query endpoints.
- Client-generated UUIDs for anything that can be created offline/on mobile.
- New features follow the module checklist in
  [docs/PRODUCT.md](docs/PRODUCT.md#modular-architecture-how-features-get-added):
  schema file + route group + `lib/roles.ts` entry + verification gate.
- Role access lives only in `apps/web/lib/roles.ts`; never inline role checks in
  pages.
- Secret API keys never reach a client bundle (`NEXT_PUBLIC_`/`EXPO_PUBLIC_` is
  the exposure boundary).
- After each milestone: demo to customer zero, fold feedback into the next one.
