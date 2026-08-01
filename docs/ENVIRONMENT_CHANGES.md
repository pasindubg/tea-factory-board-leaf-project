# Environment, Install, And Migration Change Log

Use this file to track changes that matter when hosting or rebuilding the project in a new environment.

## 2026-07-31 - Broker Invoice Transporter Attribute

- Added migration `0043_auction_sale_transporter.sql`: a nullable `transporter` text column on `auction_sales`, captured alongside the existing lorry no./driver fields on a Broker Invoice. No RLS change is needed (the table's `factory_isolation` policy already covers it). Apply migrations through `0043`.

## 2026-07-26 - Production Migrations Moved Into the Vercel Build

- **Migrations now run inside Vercel's own production build**, not a separate GitHub Actions job. `apps/web/vercel.json`'s `buildCommand` runs `pnpm --filter @tea/db db:migrate` only when `VERCEL_ENV=production`, before `pnpm run build`. This fixes a real ordering problem: GitHub Actions and Vercel used to trigger independently off the same push with no guarantee migrations finished before the new code went live. Now a failed or slow migration fails the build outright, so Vercel never activates a deployment whose migration didn't succeed — the old version keeps serving traffic.
- **Fixed a pre-existing bug found while wiring this up**: `apps/web/vercel.json` already had an `ignoreCommand` that only continued builds when the branch was `main` and skipped every other branch, including `blm-cloud-release`. With Production Branch now set to `blm-cloud-release` in the Vercel dashboard, that command would have silently skipped every production build — no error, just nothing deploying. Removed.
- `.github/workflows/release.yml` no longer runs migrations. It's the pre-merge safety gate now (lint/typecheck/test), triggered on PRs into `blm-cloud-release` as well as pushes to it. Pair it with a GitHub branch-protection rule requiring this check before merge — merging the PR becomes the actual "ship to production" approval, since Vercel deploys automatically and unattended once code lands on that branch.
- **New manual step**: Vercel needs its own `DATABASE_URL` (the hosted session-pooler string), set in Vercel Project Settings → Environment Variables, scoped to Production. The `PROD_DATABASE_URL` GitHub secret added earlier is no longer read by anything — Vercel builds never see GitHub secrets — so this is a separate value that must be entered directly in Vercel.

## 2026-07-25 - Persisted + Role-Locked List Search

- Added migration `0040_lame_raza.sql` with two tables. `list_search_states` stores each user's own saved search criteria per list instance (RLS: own row only). `list_search_locks` stores owner/manager-managed permanent criteria locks per list, keyed by base role or custom access role (RLS: factory-wide read, owner/manager-only write). Apply migrations through `0040` before using search persistence. Both tables are registered in `FACTORY_SCOPED_TABLES` in `apps/web/lib/tenant-data.ts`.
- **Search now persists per user across reloads and logins**, and **owner/manager can permanently lock criteria for a role**, configured inline from that list's own search panel (no separate admin screen; the control is invisible to other roles). Owner and manager are always exempt from locks. Lockable roles are `supervisor`/`accountant`/`collector` only — locking `owner`/`manager` would silently never apply.
- **Locks are enforced server-side, not just in the UI.** Two paths, one shared implementation (`resolveListSearchState` + `filterRowsByCriteria` in `apps/web/lib/list-search-state.ts` / `list-search-query.ts`): registry-backed lists go through `loadListResource`, and detail-page side panels call `applyServerListSearch(...)` in their own server component before rows are serialized. A locked-away row is never sent to the browser on either path. A locked key naming a field the rows lack fails closed (drops every row) — covered by `apps/web/lib/list-search-query.test.ts`.
- **Server-driven pagination** (first 100 rows, "Show more" fetches the next page via a real query) is live for the 14 registry resources that declare a `search` config: `auction.brokers`, `auction.marks`, `auction.warehouses`, `leaf.suppliers`, `leaf.collectors`, `leaf.weighings`, `payments.quality-tiers`, `payments.base-rates`, `payments.adjustments`, `payments.tier-assignments`, `payments.statements`, `communications.sent-messages`, `users.accounts`, `users.roles`. Other resources keep loading their full row set (still search/lock-filtered server-side) and never show "Show more".
- All of this is generic at the framework level, keyed off `EntityList`'s existing `scope`/`resource.key`. No page or list definition declares a field name, table, or persistence wiring. `WorkflowAuditList` now requires an explicit `scope` prop because it is reused on unrelated pages that must not share saved searches.
- `vitest.config.ts` aliases the `server-only` package to a test stub so server modules stay unit-testable. No package dependency was added.
- **Search keys are mapped by convention, not declaration.** A UI search key is auto-mapped to its snake_case column on the base table (`weightKg` -> `weight_kg`), so most need no entry. A resource declares only two kinds of exception: keys whose value lives on a joined table, and JS-computed keys (`computed`) that have no SQL column and must fall through to the row-level filter.
- **`SearchColumnMode` is driven by the column's Postgres type, not preference** — verified by probing the live database:
  - `contains` (`ilike`) works on **text only**; on any other type Postgres raises `operator does not exist: <type> ~~* unknown` and the list 400s. This is why the convention's text assumption must be overridden for non-text columns.
  - `equals` (`eq`) is safe on text, numeric, boolean and `date`.
  - `day` (`gte`/`lt` over one calendar day) is **required for `timestamp` columns**: `eq` with a bare `YYYY-MM-DD` matches midnight exactly and returns zero rows with no error — a silent wrong answer. `weighings.collected_at` and `supplier_messages.sent_at` use this.
- **Every paginated query must end its `ORDER BY` with a unique column.** Without a tiebreaker Postgres gives no stable order for ties, so paging can return the same row on two pages and skip another (caught on `users.roles` by a runtime probe). All paginated queries end with `.order("id")`.
- **Known gaps (deliberate, not silently dropped):** 4 resources still load their full row set — `auction.reprint-overview`, `auction.sale-lines` and `auction.broker-grade-thresholds` need real SQL (recursive CTE for re-print chains, sale-number normalisation, a cross join) plus a migration; `users.staff-directory` needs limit/offset added to the `list_visible_staff_profiles` RPC. `users.role-page-permissions` is not a pagination candidate at all — its rows come from the `PAGE_DEFINITIONS` code constant, not a table. All of them still filter and enforce locks server-side. Tabs inside one `EntityList` (`EntityList.tabs`) do not yet persist search per tab.

## 2026-07-25 - Split Local/Production Databases + Release Branch

- **Local dev now runs against a local Supabase CLI stack, not the hosted project.** `supabase` is a root devDependency; `pnpm supabase start` boots Postgres + Auth (GoTrue) + Storage in Docker under a separate project, so RLS (`auth.uid()`), OTP login, and admin user APIs behave exactly like production without ever touching the live customer database. `supabase/config.toml` was added by `supabase init`; Drizzle stays the single migration source of truth (no migrations moved into `supabase/migrations`) — `pnpm db:migrate` now just points at the local stack's Postgres (`127.0.0.1:54322`) for day-to-day dev.
- **New optional data clone:** `packages/db/scripts/clone-remote-to-local.sh` dumps the hosted project's `public` + `auth` schema data (via Dockerized `pg_dump`/`psql`, no local Postgres client needed) and restores it into the local stack. It's a manual, explicit, confirmation-gated script — never run by CI or any other script — and refuses to run if `DATABASE_URL` looks local (protects against running it backwards).
- **New DB-access gate: `apps/web/lib/env.ts`.** Every Supabase client construction (`lib/supabase/{server,client,admin}.ts`, `middleware.ts`, `next.config.ts`) now reads its URL/keys through this one module. It throws if a Vercel **production** deploy (`VERCEL_ENV=production`) is pointed at a local/`127.0.0.1` Supabase URL, and throws if local dev (no `VERCEL` env) is pointed at the hosted project unless `ALLOW_PROD_DB_FROM_LOCAL=true` is explicitly set. This is the single chokepoint referenced by "hosted code must never reach the local DB, local dev must never silently write to the live DB."
- **New `blm-cloud-release` branch** is the only path that applies migrations to the hosted database and deploys to production. `.github/workflows/release.yml` runs the same lint/typecheck/test gates as `ci.yml`, then runs `pnpm --dir packages/db db:migrate` against a `PROD_DATABASE_URL` GitHub secret (gated behind a `production` GitHub Environment — configure required reviewers there for a manual approval step before any live migration runs). Regular `ci.yml` on `main`/PRs never touches the hosted `DATABASE_URL`.
- **Manual steps still needed (dashboard/account access this repo can't script):**
  1. Vercel project → Settings → Git → set **Production Branch** to `blm-cloud-release` (main/feature branches then only get preview deployments).
  2. GitHub repo → Settings → Secrets → add `PROD_DATABASE_URL` (hosted session-pooler string), and Settings → Environments → create `production` with required reviewers if you want a human approval gate on live migrations.
  3. `supabase login` once per machine (needs a Supabase account) before `supabase start` works.
- No package removed; `supabase` added as a root devDependency. See [README.md](../README.md#2-set-up-the-database) for the day-to-day local setup flow.

## 2026-07-25 - Broker Invoice "BI" Prefix

- Added migration `0039_broker_invoice_bi_prefix.sql`; apply migrations through `0039` before relying on the new invoice number format.
- `auction_sales.sale_no` (the Broker Invoice number, e.g. what showed as `0010`) is now stored with a `BI` prefix, e.g. `BI0010`. The migration backfills every existing row; `nextDispatchNo()` in `apps/web/app/dashboard/auction/_actions/_shared.ts` generates the prefix for new invoices going forward.
- This is a stored-data change, not a display-only formatter: `sale_no` stays a plain `text` column, and `saleNoKey`/`saleNoMatches` already normalize by trailing digit run, so existing matching/sorting logic needed no changes. No package dependency was added.

## 2026-07-20 - Shared Detail Workspace Framework

- `apps/web` now depends on `lucide-react` for the shared detail-workspace
  command icons. Run `pnpm install` after pulling this change.
- Invoice Details, physical Dispatch Details, and Sale Details now adapt to
  `apps/web/components/detail-workspace.tsx`. Other compatible detail pages
  should provide only page-specific lifecycle commands, tenant-safe mutations,
  detail forms, and related lists instead of copying the shared layout.
- No database migration or environment variable change is required.

## 2026-07-15 - Tenant-safe Database Delete Relationships

- Added migration `0033_tenant_delete_relationships.sql`; apply migrations through `0033` before relying on the shared delete behavior.
- Unused broker configuration (`broker_rates` and existing broker/grade thresholds), Broker Invoice lots, lot invoices, and valuations now use database-owned cascades where the child has no independent meaning.
- Sale lines, VAT ledger entries, and settlements remain restrictive so financial history blocks deletion with the shared dependent-record error. Document imports, bank matches, collector login links, and nullable user actor links preserve their records with `ON DELETE SET NULL`.
- User-triggered Broker Invoice and lot deletes now issue one tenant-scoped root delete; PostgreSQL applies the relationship behavior atomically. No package dependency was added.

## 2026-07-15 - Shared List Framework And Tabs

- `apps/web` now depends on the local workspace package `@tea/ui` for the shared `FrameworkList` and `TabView` primitives. Run `pnpm install` after pulling this change so the workspace link is available.
- Existing web list controls retain sorting, search, selection, and server-action behaviour while their list surfaces and related-list tabs use the shared package primitives. No database migration is required.

## 2026-07-15 - Immutable Broker Invoice Created Date

- Added migration `0032_broker_invoice_created_date.sql` for the Broker Invoice `created_date` attribute.
- The date is generated and stored by PostgreSQL from the server-created timestamp using the Asia/Colombo calendar. Browser input cannot supply or edit it, and existing Broker Invoices are backfilled automatically from `created_at`.
- No package dependency was added. Apply migrations through `0032` before using the Created date column in Invoice Overview or Invoice Details.

## 2026-07-14 - Broker Invoice Transport Attributes And Daily Bundles

- Added migration `0031_broker_invoice_dispatch_attributes.sql` for the Broker Invoice selling mark, broker lorry number, driver, and normalized physical Dispatch link.
- New Broker Invoices use the factory's Asia/Colombo calendar date automatically and create or reuse exactly one same-day automatic bundled Dispatch.
- The database prevents the same broker and selling mark from appearing more than once in one physical Dispatch. Create at least one active warehouse before creating a new Broker Invoice; `Main warehouse` is preferred when present.
- No package dependency was added. Apply migrations through `0031` before using the new invoice fields.

## 2026-07-13 - Bundled Invoice Dispatches

- Added migration `0028_bundled_invoice_dispatches.sql` and the matching Drizzle schema.
- A physical Dispatch is now a separate Bundled Invoice record: it groups two or more confirmed Broker Invoices with the same invoice date and records the warehouse. Lots remain under their existing Broker Invoice.
- The new `auction_bundled_dispatches` and `auction_bundled_dispatch_invoices` tables both use tenant RLS and prevent a Broker Invoice from joining more than one bundle.
- No package dependency was added. Apply migrations through `0028` before using New Dispatch (Bundled Invoice).

## 2026-07-13 - Warehouse Basic Data And Dispatch Date Ranges

- Added migration `0029_auction_warehouses.sql` for the tenant-scoped warehouse LOV, including active/inactive state and tenant RLS.
- Added migration `0030_bundled_dispatch_date_range.sql`. New Dispatch stores inclusive start and end dates; setting both to the same date records a one-day dispatch.
- No package dependency was added. Apply migrations through `0030` before using warehouse basic data or date-range dispatches.

## 2026-07-13 - Broker Invoices, Final Sale Assignment, And GRN Storage

- Added migrations `0026_broker_invoice_status.sql` and
  `0027_invoice_sale_assignment_grn.sql`.
- Broker Invoice confirmation now enters `invoiced`; GRN is a separate optional
  upload/manual-proceed state before broker acknowledgement.
- `auction_lots.provisional_sale_no` retains the expected sale and
  `auction_lots.final_sale_no` is set only by valuation confirmation, allowing
  one invoice to move from sale 20 to sale 21 without changing its physical
  Broker Invoice parent.
- Added the tenant-private `auction-documents` Storage bucket and folder-based
  RLS policies. GRN images/PDFs are stored under `<factory>/<broker-invoice>/grn/`.
- Added the atomic `confirm_auction_valuation` database function. It marks
  expected-but-absent invoices `not-valued` and reassigns later matches to the
  valuation report's sale.
- No package dependency was added. Apply migrations through `0027` before using
  GRN upload or valuation confirmation.

## 2026-07-12 - Chain-aware Re-print Lifecycle

- No database migration or package installation is required. The existing
  `auction_lots.reprint_source_lot_id` parent link is the normalized history model.
- ACK-created re-print children inherit original quantity, gross weight,
  cumulative sample allowance, and remaining net weight.
- Contract `NOT SOLD` and manual Re-print transitions deduct another sample cycle.
  A future sold child stays in its later sale while Re-print Overview derives the
  complete chain and totals.

## 2026-07-10 - Auction Grade Aliases

- Added migration `packages/db/drizzle/0025_auction_grade_aliases.sql`.
- The migration creates `auction_grade_aliases` with `factory_id`, `grade_id`, normalized alias text, tenant RLS, indexes, and a unique `(factory_id, alias)` guard so one broker spelling cannot map to two factory grades.
- Added Drizzle schema `packages/db/src/schema/auction-grade-aliases.ts` and exported it from the schema index.
- No package dependency was added or intentionally changed.
- New environment action: apply all Drizzle migrations through `0025_auction_grade_aliases.sql` before using Auction setup or document reconciliation.
- Current dev DB note: `0025_auction_grade_aliases.sql` was applied directly through `DATABASE_URL` because `pnpm --dir packages/db db:migrate` exited with code 1 without printing the underlying SQL error. The schema objects for `0023`, `0024`, and `0025` were present and migration bookkeeping rows were added for those tags, but the Drizzle wrapper still exits 1 in this environment. Check migration history before relying on `db:migrate` during hosting setup.
- Verification checklist for this change:
  - add an alias such as `PEK` to the factory grade `PEKO`;
  - upload/review an acknowledgement, valuation, or sellers contract containing the alias spelling;
  - confirm the review displays the canonical factory grade and does not flag an alias-only grade mismatch;
  - run the repo typecheck command.

## 2026-07-09 - Re-print Workflow Redesign

- Added migration `packages/db/drizzle/0024_reprint_invoice_reuse.sql`.
- The migration updates `public.prevent_duplicate_lot_invoice()` so an invoice number can be reused only when the previous lot is already `re-print` and the new lot points to it through `auction_lots.reprint_source_lot_id`.
- No package dependency was added or intentionally changed.
- New environment action: apply all Drizzle migrations through `0024_reprint_invoice_reuse.sql` before testing the redesigned re-print flow.
- Verification checklist for this change:
  - create/mark an original lot as `re-print`;
  - add the same invoice to a later dispatch and confirm it links through `reprint_source_lot_id`;
  - verify active duplicate invoice reuse is still blocked;
  - run the repo typecheck command.

## 2026-07-05 - Auction UI/Search And Sale Number Formatting

- App code changed only. No new database migration was added.
- No package dependency was added or intentionally changed.
- `pnpm install --no-frozen-lockfile` was run once only to restore `node_modules` after pnpm's non-interactive install guard removed it during verification. The generated `pnpm-lock.yaml` and `pnpm-workspace.yaml` changes were reverted.
- Existing migrations already cover the touched data surfaces:
  - `0010_add_auction_tables.sql` includes `auction_sales` and `auction_lots.sample_allowance`.
  - `0014_lot_invoices_dispatch_first.sql` includes `lot_invoices`.
  - `0018_broker_rates.sql` includes `broker_rates`.
  - `0022_auction_grade_thresholds.sql` includes `auction_grades` and `broker_grade_thresholds`.
- New environment checklist remains unchanged:
  - install dependencies from the committed lockfile;
  - configure `.env`/Supabase keys;
  - apply all committed Drizzle migrations in order;
  - run `db:verify-rls` and `db:verify-auth`;
  - run `tsc --noEmit` or the repo typecheck command.
