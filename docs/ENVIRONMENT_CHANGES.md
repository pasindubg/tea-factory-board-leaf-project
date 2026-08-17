# Environment, Install, And Migration Change Log

Use this file to track changes that matter when hosting or rebuilding the project in a new environment.

## 2026-08-17 - Durable Background Job Worker

- **Two new environment variables, and a run will not start without BOTH.** They are in `.env.example` and `.env.local.example`, and must be added to Vercel for production:
  - `SUPABASE_JWT_SECRET` — Supabase ▸ Project Settings ▸ API ▸ JWT Secret. Locally the CLI's fixed default (`pnpm supabase status -o env` prints it as `JWT_SECRET`; it is identical on every machine). **As sensitive as `SUPABASE_SECRET_KEY`: it can mint a token for any user.**
  - `JOBS_TICK_SECRET` — any long random string (`openssl rand -hex 32`). The worker endpoint refuses to do anything without it.
  - Both are read through `getJobsEnv()` in `apps/web/lib/env.ts`, which throws by name rather than defaulting. A missing variable was previously invisible: the run stayed at **Waiting to start** and looked like a broken worker instead of an unset value.
- **Apply migrations through `0052_little_rhodey.sql`** (hand-written; `drizzle-kit` cannot diff it because `0051` was hand-written too and its snapshot has no such table). It adds `payload`, `cursor`, `attempts`, `worker_id`, `lease_until`, `run_after`, `cancel_requested_at`, `cancelled_by`, `schedule_id` to `"BACKGROUND_JOB_RUNS"`, widens `status` to `queued|running|completed|failed|cancelled`, creates `"BACKGROUND_JOB_SCHEDULES"` with RLS, and heals any pre-existing `running` row to `cancelled`. Every statement is conditional, so re-running is harmless.
- Migration `0052` also creates `public.claim_background_job(p_worker_id, p_lease_seconds)` — `SECURITY DEFINER`, granted to `service_role` only. It is a `FOR UPDATE SKIP LOCKED` claim, so two workers racing cannot take the same run.
- **`vercel.json` now declares a cron** on `/api/jobs/tick`, `0 2 * * *`. It is a **backstop, not the trigger**: the action that queues a run nudges the worker immediately (`lib/jobs/trigger.ts`), and the cron only collects what that nudge missed — a run whose worker died, or one queued during a deploy. **Hobby does not collapse a more frequent schedule, it refuses to deploy it**: `*/5 * * * *` fails the build with *"Hobby accounts are limited to daily cron jobs."* Hobby also drifts up to 59 minutes, so `0 2 * * *` fires somewhere in 02:00–02:59 UTC (~07:30–08:30 Colombo). One tick claims one run and does one chunk, so on Hobby the cron is a weak backstop — **the real recovery path is Execute on the Background jobs page.**
- **The worker acts as the run's own user, never as the admin client.** `lib/jobs/auth.ts` signs a 10-minute HS256 token for `started_by` and builds an ordinary Supabase client with it, so **RLS is enforced on every row a job writes**. The admin client is used for exactly one call — the claim, which is inherently cross-tenant — and never to read or write a tenant table. Rights are re-read at claim time (`lib/jobs/actor.ts`), so a job queued days ago cannot carry access its owner has since lost.
- **`lib/profile.ts` gained a two-line injection at its chokepoint**: `resolveProfile()` returns the job actor from `AsyncLocalStorage` (`lib/jobs/context.ts`) when one is installed. That is what lets a handler call the *very same* server actions a page calls, with no session — and it removed the several `auth.getUser()` round trips each imported row was paying. `readProfile()` was split out because it must **return** failure rather than `redirect()`: a redirect thrown from a gate deep inside the loop is what used to abort an import when somebody signed out.
- **No job has a time limit.** `maxDuration` bounds one *chunk* (60s ceiling on Hobby; the handler stops at 45s), and a chunk always leaves a cursor behind — the next tick claims the same run and continues. An interrupted chunk loses only the units since the last cursor write, and progress is published every 5 rows, so a run that fits in one chunk still shows a bar that moves.
- **The tick responds BEFORE it works**, and chains to itself when a chunk ends with the run unfinished. This is load-bearing, not an optimisation: the handover is an HTTP call to the same route, so if the work happened before the response, each tick would hold a connection open across its successor's entire chunk — nested calls, killed by `maxDuration` long before the run ended. Claiming first and responding immediately keeps the chain flat, one fresh invocation with a fresh budget per chunk. The route therefore returns `{claimed, runId, status}` and never a chunk result; the run row is the only place progress can honestly be read.
- **An unfinished run stays `running` with a null lease, not `queued`.** Both are claimable (`claim_background_job` reclaims a `running` row whose lease has lapsed), but only one is true, and `queued` renders as **"Waiting to start"** at 12 of 230 rows while also stopping the page polling. A chunk that neither finishes nor advances fails the run rather than chaining forever.
- Verify locally with `pnpm --dir apps/web dev`, then `curl -X POST -H "authorization: Bearer $JOBS_TICK_SECRET" http://localhost:3000/api/jobs/tick` — it returns `{"claimed":0}` when the queue is empty and `{"claimed":1,…}` immediately otherwise. **Use the port the dev server actually printed**: Next silently moves to `:3001` when `:3000` is held, and a nudge posted at the wrong port fails silently.
- New pieces, all server-only: `app/api/jobs/tick/route.ts` (the worker), `lib/jobs/{auth,actor,context,registry,trigger}.ts`, `lib/jobs/handlers/dispatch-import.ts`. Row logic moved to `blm-cloud/auction-data/_actions/import-row.ts` so it is **not** in a `"use server"` file — everything exported from one of those is a public endpoint.
- `startJobRun` now opens a run as `queued` (was `running`) and takes a `payload`. The payload must be self-contained: the worker reads it minutes later in another process, with no upload to go back to.
- The Dispatch Schedule import carries its parser-rejected rows on the payload and attaches them only when the run **finishes**. Seeding them onto the run when it was queued meant a run that had not started yet displayed "Skipped: 112" over a 0% bar, reading as an import that had run and rejected everything.

## 2026-08-16 - Background Job Framework

- Added migration `0051_background_job_runs.sql`: table `"BACKGROUND_JOB_RUNS"` — `job_key`, `label`, `status`, `total_units`/`processed_units`, `metrics` jsonb, `notes` jsonb, `items` jsonb, `error`, `started_at`/`updated_at`/`finished_at`, `started_by` — with RLS and the `factory_isolation` policy (USING + WITH CHECK on `current_factory_id()`) in the same migration. Everything is created conditionally, so re-running is harmless. Registered in the `tenant-data.ts` allowlist. Apply migrations through `0051`.
- **The table name is upper case**, which is a deliberate exception to every other table here. PostgreSQL folds unquoted identifiers to lower case, so every SQL reference must stay double-quoted (`"BACKGROUND_JOB_RUNS"`) and Supabase/PostgREST callers must match the case exactly — `.from("BACKGROUND_JOB_RUNS")` works, `.from("background_job_runs")` fails with `PGRST205`. Drizzle quotes identifiers for us, and the runtime keeps the name in one `TABLE` constant in `lib/background-jobs-server.ts`.
- **Why it exists:** a long server action outlives the page that started it. The tab can be refreshed or closed while the work continues, so holding progress in the browser loses it — the operator watched an idle form while invoice counts climbed, and the final report was never shown. The run row is the source of truth instead, and any tab can read it.
- **Deliberately job-agnostic.** `job_key` names an allowlisted job definition in `apps/web/lib/background-jobs.ts`, exactly as a list-resource key names a read model. The definition owns the title, unit names, metric labels/tones, per-item status tones and which statuses mean "needs attention"; the table stores only raw state. Adding a job is a key in `JOB_KEYS`, a definition, and a start form — no new table, poller or progress bar.
- **BLM Cloud navigation group** now holds both platform pages: **Background jobs** (owner/manager) and **Auction data reset & import** (owner only), the latter moved out of personal settings — `/dashboard/settings/auction-data` → `/dashboard/blm-cloud/auction-data`, page key `settings-auction-data` → `auction-data`. It is destructive tooling, not a personal preference, and it now sits with the other platform operations instead of behind a card on the user's own settings page.
- **Overview page:** a new navigation group **BLM Cloud** (`MODULE_GROUP_ORDER`, slug `blm-cloud`) with **Background jobs** at `/dashboard/blm-cloud/background-jobs` (owner/manager). It lists every run with a `State` attribute — **In progress** / **Completed** / **Error** / **Interrupted** — plus an inline progress bar, the job's own tallies, who started it and how long it took. Backed by the `framework.background-jobs` list resource; the list re-reads itself every 5s only while something is in progress.
- **Start notice:** `announceJobStarted(runId)` raises a toast — "Background job created (id)" — with a **Go to background job** link that deep-links `?run=<id>`, highlighting that run in the overview. `showAppToast` gained an optional `action` (a single link) and holds an actionable toast three times as long.
- **timestamptz, not timestamp:** `started_at`/`updated_at`/`finished_at` are `timestamptz`. `updated_at` is a heartbeat compared against the clock in application code, and a naive `timestamp` is reinterpreted as machine-local when it becomes a JS `Date` — a brand-new row measured 19,800s old (the Asia/Colombo offset), so every running job reported itself as interrupted. Caught by exercising all four states against the real database.
- Framework pieces: `lib/background-jobs.ts` (client-safe keys, types, definitions), `lib/background-jobs-server.ts` (`startJobRun` / `updateJobProgress` / `finishJobRun` / `latestJobRun` / `jobIsRunning`), `app/_actions/background-jobs.ts` (the single `fetchJobRun` poll — the browser sends only a compile-time key; the factory comes from the session), and `components/background-job-progress.tsx` (`useJobRun` hook + `BackgroundJobProgress` surface).
- A run whose `updated_at` heartbeat is older than 2 minutes is reported as **interrupted** rather than showing a bar that will never move; work completed before it stopped is kept. Progress is written every few units, not every unit, so the bar moves without a database write per record.
- The Dispatch Schedule import is the first job on it (`auction.dispatch-import`); its bespoke run table, poller and progress UI were removed. Starting a second run while one is in flight is refused by `jobIsRunning`.
- Also added migration `0050_curious_changeling.sql`: a generated `created_date` on `auction_bundled_dispatches` (same Asia/Colombo expression as `auction_sales.created_date`), so the Dispatch Details list can offer **Created date** as a database-filterable search column. `GENERATED ALWAYS ... STORED` computes for existing rows, so there is no backfill.
- **Search bug fixed:** `auction.sale-lines` has no `search` config, so it is filtered row-level on the server — and that filter compares a criterion against the row's own property, not the column's accessor. The `Guarantee` and `Re-print` columns were keyed on booleans while offering labels ("Guarantee"/"Cash"/"Not sold", "Yes"/"No"), so searching them matched in the browser and then returned ZERO rows through the server. The rows now carry `guaranteeLabel`/`reprintLabel` and the columns key on those. Regression tests in `apps/web/lib/list-resource-search.test.ts` pin both the old failure and the fix.

## 2026-08-16 - Go-live Auction Data Reset And Dispatch Schedule Import

- **New dependency:** `fflate` in `packages/api` (MIT, ~10 KB) to unzip .xlsx. A full spreadsheet library was avoided — `packages/api/src/auction/read-xlsx.ts` reads only what one fixed sheet layout needs.
- No schema change. New owner-only page `/dashboard/settings/auction-data` (`settings-auction-data` in `PAGE_DEFINITIONS`), reached from a card on the personal settings page. Deliberately outside the Auction module's navigation: it is destructive and used once at cutover, not daily.
- **Stage 1 — reset** (`_actions/reset.ts`) deletes the factory's auction TRANSACTION data in dependency order: vat_ledger, settlement_charges, settlements, sale_lines, valuations, doc_imports, auction_audit, lot_invoices, auction_lots, auction_bundled_dispatch_invoices, auction_sales, auction_bundled_dispatches. Configuration is preserved — brokers, marks, grades, warehouses, invoice prefixes and broker rate cards — because the import needs it. Row counts are shown per entity before deleting and reported per entity after; the operator must type DELETE. Deleting explicitly rather than relying on cascade is what makes every table countable and reportable.
- **Stage 2 — import** (`_actions/import.ts`) applies each spreadsheet row through the SAME server actions the Invoice Overview page uses: `createInvoiceFromOverview` for an ordinary lot invoice and `registerOutstandingReprint` for a cutover re-print. Nothing is re-implemented, so broker-invoice creation, dispatch bundling, invoice numbering and re-print chaining are exercised exactly as by hand, and any defect surfaces per row with the application's own error message.
- Grade spellings are resolved before any invoice is written: a spelling meaning an existing grade becomes an `auction_grade_aliases` row (PEKOE→PEKO, PEKOE1→PEKO1, B.M→BM, DUST1→DUST, FBOPFSp→FBOFSP, "OP 1"→OP1); any other spelling becomes a new ACTIVE `auction_grades` row, usable on invoices immediately.
- **Re-prints now carry two sale numbers** — the sale first offered in (`auction_lots.provisional_sale_no`) and the sale sold in (`final_sale_no`). The register form takes both, and the Re-print Overview shows `First sale` and `Sold sale`. No migration: both columns already existed.
- Verify with `pnpm --dir packages/api test:dispatch-sheet` (skips itself if the workbook is absent). Against the real book it reads 230 importable rows, 112 skipped with reasons, 4 re-prints, April–July 2026.
- **Reader bug fixed while building this:** a styled-but-empty cell is written self-closing (`<c r="K2"/>`); matching only `<c …>…</c>` paired its opening tag with the NEXT cell's closing tag, so every column after it shifted left and `Lot No.` read the acknowledgement date. Covered by a test asserting the raw row-2 cells.

## 2026-08-15 - Broker Rate Card Read From The Sellers Contract

- No schema change. `packages/api/src/auction/parse-contract-rates.ts` reads the broker's deduction rate card off the Account Sales block of a Tea Sellers Contract, and `ParsedContract` now carries a `rates` object. The contract is the source of truth for what a broker charges.
- Only the RATES are parsed, never the amounts printed beside them. PDF text extraction returns the page in drawing order, so those figures arrive detached from their labels and cannot be attributed reliably; the rates live inside the label text (`Brokerage @ 1.00%`, `Handling Charge @ Rs.3.58 Per Kg`) and survive intact. Every amount is then derived by the existing `computeSettlement`.
- `confirmContract` creates a `broker_rates` row from those rates when the broker has none, and writes an audit entry. Previously `broker_rates` was empty with no UI to fill it, so `if (rateCard)` never ran and **no settlement was ever computed** — which is why Total revenue / Bank credit read `—`. An EXISTING card is never silently overwritten: a rate change is a real commercial event and rewriting it would restate settlements already computed.
- The contract review screen shows two callouts: an amber one listing every rate where the saved card disagrees with the contract (`contractRateDifferences`), and a sky one naming the card that confirming will create when none exists.
- Verify with `pnpm --dir packages/api test:contract-rates`. It parses all five real contracts (both brokers, sales 19/20/23 — BPML writes `Rs.0.06`/`VAT 18%`, ASIA SIYAKA writes `Rs. 0.060`/`VAT 18 %`) and recomputes SLC-S20-BL's own printed Account Sales totals from the parsed card, matching to within one cent.
- New fixtures: `contract-charges-bpml-sale-020.txt`, `contract-charges-asia-sale-020.txt`.

## 2026-08-15 - Broker Document Format Guard At Upload

- No schema or dependency change. `packages/api/src/auction/broker-format.ts` adds `detectBrokerFormat` / `brokerDocumentMismatch`, wired into `ingestAcknowledgement`, `ingestValuation` and `ingestContract` (`apps/web/app/dashboard/auction/_actions/ingest.ts`). A document uploaded against the wrong broker is now refused with an error toast before it is staged, instead of staging cleanly and failing later as an invoice-matching error.
- Detection uses the same markers the parsers branch on, so it cannot drift from what the parser would do with the file. Identity markers (trading name, VAT number, office address) are tried first across all formats; layout fingerprints are the fallback for documents that never name the house — the **BPML acknowledgement carries no broker name, VAT, or address at all** and can only be recognised by its `Tot.No. Of Lots Catalogued` layout.
- A broker the factory registered that has no format defined here is deliberately allowed through: it cannot be checked either way, and blocking it would mean a two-broker rule vetoing a third house.
- New fixtures generated through the app's own `unpdf` extraction (not `pdftotext`) from the real sale-19 documents: `ack-bpml.txt`, `valuation-bpml.txt`, `valuation-asia-siyaka.txt`, `contract-bpml.txt`, `contract-asia-siyaka.txt`. `ack-asia-siyaka.txt` was regenerated byte-identical.
- Verify with `pnpm --dir packages/api test:broker-format` (all six real documents, both brokers, every wrong-broker combination).

## 2026-08-14 - Outstanding Re-prints Register

- Added migration `0049_typical_nehzno.sql`: an `entry_source` text column on `auction_sales` (`NOT NULL DEFAULT 'invoice'`), a hand-written `auction_sales_entry_source_check` accepting `invoice` and `reprint-register`, and a rebuild of the partial unique index `uq_auction_sales_open_broker_mark` to key on `(factory_id, broker_id, selling_mark_id, dispatch_date, entry_source)`. `entry_source` records which screen opened a Broker Invoice: `reprint-register` means its first lot was entered on the Re-prints page as a re-print the factory already had outstanding before go-live, so nothing was physically dispatched for it and the UI badges it `Re-print register` instead of letting it read as a real dispatch. Including it in the unique key is what lets a cutover entry coexist with an open dispatch invoice for the same broker, mark and date rather than being merged into it. No RLS change is needed — the table's `factory_isolation` policy (USING + WITH CHECK on `current_factory_id()`) already covers the new column. Apply migrations through `0049`.
- The migration heals rather than fails: the column is added `IF NOT EXISTS`, any NULL or out-of-domain value is normalised to `'invoice'` **before** the CHECK is added, the constraint is dropped `IF EXISTS` first, and the index is dropped/recreated `IF (NOT) EXISTS`. Re-running the file is harmless and no pre-existing row can block a deploy.
- Outstanding re-prints are entered as REAL lots through the ordinary lot-invoice path (same prefix resolution, grade and kg/bag rules), then moved to `re-print`. No new table: the acknowledgement carry-forward resolver already links a later broker catalogue row to a `re-print` lot as a chain child via `reprint_source_lot_id`. See `docs/AUCTION.md` §Outstanding re-prints at cutover.
- The carry-forward match rule was extracted, behaviour-preserving, from `apps/web/app/dashboard/auction/_actions/ingest.ts` into `packages/api/src/auction/match-carry-forward.ts` so it can be exercised against real broker documents.
- **The acknowledgement REVIEW SCREEN now resolves carry-forward too.** `reconcileAcknowledgement` compares only against the lots invoiced in the sale group being reviewed, so a lot carried forward from an earlier broker invoice — including a registered re-print — was always shown as `unexpected`, while confirmation quietly resolved it. The operator was told one thing and the system did another, which is precisely the noise the register exists to remove. Both paths now call `resolveAckCarryForward` (`apps/web/app/dashboard/auction/_actions/carry-forward.ts`), so the preview and the confirm action cannot disagree. Rows resolve to the display statuses `re-print` or `rolled forward`, the summary chips are counted from what the table actually shows, and a resolved row is no longer offered to the manual orphan resolver.
- **Bug fix, affects more than the register:** the carry-forward CANDIDATE QUERY compared invoice numbers verbatim (`invoice_no.in.(0909)`) while the matcher compares through the index-cycle prefix. Because the factory stores `26I02-0909` and a broker prints `0909`, the query returned nothing and the matcher was handed an empty list — so **any** prefixed lot invoice re-catalogued in a later sale silently stayed `unexpected` instead of rolling forward. The fetch now uses `carryForwardInvoiceFilters` (`invoice_no.eq.<n>` OR `invoice_no.like.*-<n>`), which lives beside the matcher so the two cannot drift apart again. Nothing to migrate; existing lots wrongly re-created as duplicate ACK-sourced rows before this fix must be merged by hand.
- No package dependency was added or changed.
- Verification checklist for this change:
  - apply migrations through `0049_typical_nehzno.sql`;
  - `pnpm --dir packages/api test:carry-forward` (runs against the real Asia Siyaka sale-019 acknowledgement);
  - `pnpm --dir packages/api test:auction` and `test:match` for no regression in ACK parsing/reconciliation;
  - run `db:verify-rls` and `db:verify-auth`;
  - run the repo lint and typecheck commands.

## 2026-08-03 - Physical Dispatch Status Lifecycle

- Added migration `0046_blue_rocket_raccoon.sql`: a nullable `dispatched_at` timestamp on `auction_bundled_dispatches`, a widened `auction_bundled_dispatches_status_check` accepting `received` and `catalogued` alongside `draft`/`dispatched`, and a backfill setting `dispatched_at` for any row already sitting in `dispatched`. The CHECK was hand-written in an earlier migration, so drizzle-kit does not widen it when the TypeScript enum gains values — the two new statuses would otherwise be rejected at write time. A dispatch now runs draft -> dispatched -> received -> catalogued, where only `dispatched` is a user action (`markDispatchDispatched`); `received` and `catalogued` are derived from the broker invoices inside the dispatch reaching GRN and acknowledgement respectively. The derivation lives in `apps/web/app/dashboard/auction/dispatch-status.ts` and is re-applied by `syncDispatchForBrokerInvoice` after each broker-invoice transition (confirm, GRN, ingest acknowledgement). `dispatched_at` is stored separately from `status` so a dispatch that gains a new draft invoice falls back to `dispatched` rather than `draft`. No RLS change. Apply migrations through `0046`.

## 2026-08-02 - Broker Invoice Uniqueness Now Includes Dispatch Date

- Added migration `0045_flippant_mojo.sql`: rebuilds the partial unique index `uq_auction_sales_open_broker_mark` on `auction_sales` to key on `(factory_id, broker_id, selling_mark_id, dispatch_date)` instead of `(factory_id, broker_id, selling_mark_id)`. The old key allowed only one open (`draft`/`dispatched`) Broker Invoice per broker + selling mark ever, which blocked creating the next dispatch day's invoice for the same broker and mark. Each dispatch day is separate work, so the date now belongs in the key; same-day duplicates are still rejected (and independently by `uq_auction_sales_bundle_broker_mark`, since the auto-created bundle is one per dispatch date). The matching app-layer pre-check `findOpenDraftInvoice` (`apps/web/app/dashboard/auction/_actions/sales.ts`) filters on the dispatch date too and short-circuits on a null date, mirroring Postgres treating nulls as distinct in a unique index. No RLS change. Apply migrations through `0045`.

## 2026-08-01 - Locked Advanced Query On Search Locks

- Added migration `0044_list_search_lock_advanced_query.sql`: a nullable `advanced_query` text column on `list_search_locks`, alongside the existing per-role `criteria` jsonb. A locked advanced query is a mandatory AND-ed prefix, not a full replacement — the locked role can still type further terms, which the framework ANDs onto the locked one (`mergeAdvancedQuery` in `apps/web/lib/list-search-state.ts`), enforced server-side for both registry-backed (`loadListResource`) and local (`applyServerListSearch`) lists. The "Lock this search for a role" control (`apps/web/components/list-controls.tsx`) also now lists the factory's custom access roles, not just base roles, via a new `listLockableRoles()` action gated to owner/manager (not the owner-only Roles module). Apply migrations through `0044`.

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

## 2026-08-11 - Framework LOV Pickers And DB-Level Reference Validation

- New migration `0048_salty_spencer_smythe.sql` adds `fk_auction_lots_grade`:
  `auction_lots(factory_id, grade)` -> `auction_grades(factory_id, code)`,
  `ON UPDATE CASCADE`, `ON DELETE NO ACTION`. It references the existing
  `uq_auction_grades_factory_code` unique index, so no new index is required.
- Behaviour change: a lot may no longer carry a grade code its factory has not
  defined. This applies to broker-document ingestion too — an acknowledgement,
  valuation, or sellers contract naming an unknown grade is now REJECTED at
  write time instead of silently stored. Add the grade, or an
  `auction_grade_aliases` row for the broker's spelling, before re-importing.
- Before applying to an environment with existing data, check for rows the
  constraint would reject:

  ```sql
  SELECT DISTINCT l.factory_id, l.grade
  FROM auction_lots l
  WHERE l.grade IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM auction_grades g
      WHERE g.factory_id = l.factory_id AND g.code = l.grade
    );
  ```

  Any row returned must be corrected (or its grade registered) first, or the
  migration will fail. The local stack returned zero rows.
- No package dependency was added or intentionally changed.
- Verification checklist for this change:
  - apply migrations through `0048_salty_spencer_smythe.sql`;
  - confirm saving a lot with an unknown grade is refused and reports the value;
  - confirm saving a lot with a known grade still succeeds;
  - run `db:verify-rls` and `db:verify-auth`;
  - run the repo lint and typecheck commands.
