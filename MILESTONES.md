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

## M6 — Payments (the killer feature)
⚠️ Before building: confirm the real payment formula with customer zero.
Likely monthly green-leaf rate × kg with quality adjustments —
adjust `price_rates` schema accordingly.

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
The made tea leaves the factory and becomes revenue:

- Lots: pack graded tea into lots, status transitions (open → processing →
  graded → sold), lot ↔ grade-output composition
- Dispatch / delivery records: lot leaves the factory to a destination
  (Colombo auction via broker, or a direct buyer)
- Sale records: sale price per kg per grade/lot, buyer/broker, sale date,
  proceeds — the revenue side that feeds accounting (M10)
- Buyer/broker registry per factory

**Verify:** a lot is built from grade outputs, dispatched, and sold; lot totals
reconcile to the grade outputs that went in; sale proceeds compute correctly.

## M10 — Accounting
Books on top of the operational data, closing the ERP loop:

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
- Client-generated UUIDs for anything that can be created offline/on mobile.
- New features follow the module checklist in
  [docs/PRODUCT.md](docs/PRODUCT.md#modular-architecture-how-features-get-added):
  schema file + route group + `lib/roles.ts` entry + verification gate.
- Role access lives only in `apps/web/lib/roles.ts`; never inline role checks in
  pages.
- Secret API keys never reach a client bundle (`NEXT_PUBLIC_`/`EXPO_PUBLIC_` is
  the exposure boundary).
- After each milestone: demo to customer zero, fold feedback into the next one.
