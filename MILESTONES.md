# Tea Factory Ops — Milestone Plan

Each milestone is independently shippable and has a concrete verification gate.
Do not start milestone N+1 until N's gate passes.

**Ordering rationale:** Web dashboard ships *before* mobile. The factory owner can
start entering data from the office on day one (replacing the paper book at the
factory gate), which delivers value to customer zero while the mobile app is still
in progress. Offline sync — the riskiest piece — comes only after online flows are
proven end-to-end.

---

## M0 — Monorepo scaffold
Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`,
empty workspace packages (`apps/web`, `apps/mobile`, `packages/db`, `packages/api`,
`packages/ui`), shared lint/TS config, `.env.example`, git init.

**Verify:** `pnpm install` and `pnpm turbo build` succeed from a clean clone.

## M1 — Database + multi-tenancy
Supabase project created. Drizzle schema for all tables (use `numeric`, not `real`,
for weights and money). Migrations run against Supabase. RLS policies for factory
isolation on every table. Seed script: 2 factories, users in each role, suppliers,
sample weighings.

**Verify:** Logged in as factory A's owner, a query for weighings returns only
factory A rows; same query as factory B's owner returns only factory B rows.
Anonymous queries return nothing.

## M2 — Auth + app shells
Supabase Auth (email OTP to start; phone OTP later — it needs a paid SMS provider).
Next.js app with login → authenticated dashboard layout shell. User's `factory_id`
and `role` resolved on login and available in session context.

**Verify:** Owner logs in on web and lands on an (empty) dashboard scoped to their
factory. A collector-role login is rejected from the web dashboard.

## M3 — Web dashboard core (customer zero goes live)
Using `supabase-js` directly (no tRPC yet):
- Suppliers CRUD (list, add, edit, deactivate)
- Collectors CRUD
- Manual weighing entry form (office data entry replaces the paper book)
- Weighings list with date/supplier/collector filters
- Dashboard overview: today's total intake kg, intake by collector, 7-day chart

**Verify:** Factory owner can add a supplier, record a weighing against them, and
see it reflected in the day's totals — full workflow with no developer involvement.
*Put this in front of the real factory and collect feedback before continuing.*

## M4 — Mobile app, online-only
Expo app: login (collector role), home with today's summary, weigh form
(supplier picker → weight → submit), today's records list. Writes go straight to
Supabase. Client-generated UUIDs from day one so M5 doesn't change the data model.

**Verify:** A weighing recorded on the phone appears in the web dashboard within
seconds. Collector sees only their own factory's suppliers.

## M5 — Offline support (highest-risk milestone)
Local persistence + sync: supplier/collector lists cached locally for offline
reads; weighings written locally and pushed when connectivity returns; sync status
screen (pending count, last sync time, manual retry).

Decision point: WatermelonDB full sync vs. a plain expo-sqlite outbox. The data
flow is append-only writes + read-only reference caches, so evaluate the outbox
approach first — it avoids implementing WatermelonDB's pull/push protocol and
keeps Expo Go usable. Either way: server wins on conflict, client UUIDs make
pushes idempotent (retrying a push never duplicates a weighing).

**Verify:** Airplane-mode test — record 3 weighings offline, kill and reopen the
app (records persist), restore connectivity, all 3 appear on the web dashboard
exactly once. Repeat with a push that fails mid-way: no duplicates.

## M6 — Payments (the killer feature)
⚠️ Before building: confirm the real payment formula with customer zero.
Likely it is monthly green-leaf rate × kg with water/coarse-leaf deductions,
NOT per-made-tea-grade rates — adjust `price_rates` schema accordingly.

- Settings page: manage rates (with effective-from dates)
- Monthly calculation as a server-side tRPC procedure (first real use of tRPC):
  per supplier, sum kg × rate effective at each weighing's collection date
- Payments page: generate a month, review per-supplier statement, mark paid
- Printable per-supplier statement (factories hand these out)

**Verify:** Fixture test — known weighings spanning a mid-month rate change
produce hand-calculated expected totals to the cent. Run a real month in parallel
with the factory's manual books and reconcile.

## M7 — Lots & grade tracking
Lots CRUD, status transitions (open → processing → graded → sold), assign
weighings to lots, lot summary view.

**Verify:** Create a lot, attach weighings, move it through statuses, totals match.

## M8 — Production hardening & deploy
Web on Vercel, EAS Build for the mobile app (+ EAS Update for OTA fixes),
Supabase backups confirmed, basic error reporting (Sentry), factory onboarding
script (create factory + owner user), README runbook.

**Verify:** Customer zero runs a full month — daily collection through payment
generation — with zero developer intervention.

---

# Phase 2 — Leaf Marketplace

**Vision:** an Uber-like two-sided marketplace where leaf suppliers / estate
owners and factories / buyers both have accounts. Suppliers list available leaf;
buyers discover suppliers by area and quality; quality becomes a score and a
price signal instead of a binary accept/reject at the factory gate (which today
costs factories the supplier relationship).

**Why Phase 1 first:** the ERP is the wedge. Every factory onboarded brings its
supplier book, seeding the marketplace network. Phase 1 milestones (M0–M8) stay
unchanged and ship first.

**Key architectural shift:** in Phase 1 a supplier is a row owned by one factory.
In Phase 2 a supplier becomes an independent account that can deal with many
factories. M9 makes this migration explicit; everything else builds on it.

## M9 — Supplier identity & accounts
Suppliers become first-class users: new `supplier` auth role, self-signup flow,
supplier profile (location, land size, capacity, photos). Existing factory-owned
supplier rows become *links* (factory ↔ supplier relationships) so Phase 1
factories keep working unchanged; a factory can "invite" its paper-book suppliers
to claim their account. RLS rework: suppliers see their own data across
factories; factories see their linked suppliers.

**Verify:** a supplier self-signs up, completes a profile, and sees their own
delivery/payment history from a linked factory. Factory dashboards unchanged.

## M10 — Geo discovery (Google Maps)
Geocode supplier and factory locations. Factory-side: map + radius search for
suppliers in an area (with capacity and quality summary). Supplier-side: map of
factories buying nearby, with their current price boards.

**Verify:** a factory finds suppliers within X km of a town; a supplier sees
nearby factories and their prices.

## M11 — Listings, offers & transactions (marketplace core)
Suppliers post leaf availability (quantity, date, asking price, photos).
Factories publish buy prices / post offers on listings. Accept → transaction
record that flows into the Phase 1 weighing/payment pipeline on delivery.

**Verify:** two test accounts complete listing → offer → accept → delivery →
payment end to end.

## M12 — Quality & trust
Per-delivery quality rating by the factory (moisture, coarse leaf %, photos).
Supplier quality history and score visible to buyers; price differentiation by
quality grade. Supplier **acceptance-rate grade**: track accepted vs rejected
(or downgraded) deliveries per supplier across all factories and derive a
platform-wide supplier grade — computable from delivery records alone, no
photos/ML needed, so it ships first within this milestone. Research spike
(separate, unscheduled): image-processing leaf quality detection from photos —
prototype against rated delivery photos collected here, adopt only if accuracy
beats manual grading.

**Verify:** a rated delivery updates the supplier's public score; a rejected
delivery lowers the acceptance rate; a buyer can filter discovery by minimum
quality score.

## M13 — Marketplace operations & monetization
Commission or subscription billing on transactions, SMS/push notifications
(listing matches, offer accepted, payment made), platform admin panel
(verification of accounts, dispute handling). **Premium factory tier**: basic
plan sees a supplier's overall score only; premium plan unlocks the detailed
supplier intelligence (acceptance-rate history, per-factory quality breakdown,
delivery volume trends) — feature-gated by subscription plan on the factory
account.

**Competitive intelligence add-on (both sides pay):**
- Factory premium+: discover top-graded suppliers currently delivering to
  competitor factories in an area.
- Supplier premium: see which factories buy from competing suppliers nearby,
  and the grades/prices those factories give.
- ⚠️ Design constraint to resolve BEFORE building: this must be powered by
  marketplace-generated or aggregated/anonymized data — never raw private ERP
  records — or factories will abandon the ERP wedge once they realize their
  supplier book is for sale. Strong option: reciprocal opt-in (you only see
  competitor insights if you share yours).

**Verify:** a completed transaction produces a correct platform fee record;
both sides receive notifications at each step; a basic-plan factory cannot see
premium supplier intelligence and an upgraded one can; competitive-intel
queries return only data the source party consented to share.

---

## Standing rules
- `numeric` for all money/weight columns; never `real`.
- Every table row carries `factory_id`; every new table gets an RLS policy in the
  same migration.
- Client-generated UUIDs for anything that can be created on mobile.
- After each milestone: demo to customer zero, fold feedback into the next one.
