# Environment, Install, And Migration Change Log

Use this file to track changes that matter when hosting or rebuilding the project in a new environment.

## 2026-09-18 - Neon cutover hardening and verification (not yet released)

- Web login is username/password only. Legacy email confirmation links return to login. Runtime session, auth administration, storage and job adapters now use Neon; keeping the Supabase SDK for PostgREST compatibility does not imply using the Supabase service.
- Applied `003_request_identity.sql` to Preview and Production after explicit Production approval, preserving factory/role predicates. Revoked ordinary-user access to `claim_background_job` and `get_email_for_login` on all three environments. Removed the blanket function-execution grant from `002_grants.sql` to prevent reintroducing those privileges. Public signup is disabled on all three Neon branches.
- Jobs no longer require `SUPABASE_JWT_SECRET`. Worker handovers require `JOBS_TICK_SECRET`; configure a server-only `CRON_SECRET` in Vercel so scheduled GET requests authenticate. A caller-controlled `x-vercel-cron` header is never trusted. Queue bookkeeping remains privileged control-plane access; domain operations use the factory-scoped job identity.
- Storage creation uses atomic `If-None-Match: *` unless an authorized path explicitly permits overwrite. Mobile create-only uploads include the signed conditional header. Development storage credentials are configured locally; Vercel Preview/Production still need their own `AWS_*` credentials and endpoints before release.
- `packages/db/neon/migrate-storage.mjs` copies only missing files, refuses differing existing objects, preserves factory-prefixed keys, and verifies SHA-256 after reading the uploaded object back. It leaves Supabase untouched.
- `verify-cutover.mjs` compares included table contents, not merely row counts, with UTC sessions and deterministic C-collation sorting. Eight customer-book tables and `users.supplier_id` remain intentionally excluded per the original migration. Permission rows match. The audit found timestamp differences in 23 tables: a 5.5-hour shift in naive timestamps and sub-millisecond precision loss in job timestamps. **Do not rerun the destructive full-data importer to repair these.**
- `migrate-data.mjs` now preserves date/timestamp text instead of passing it through JavaScript Date. Exact date, timestamp and timestamptz round trips were verified on the isolated test branch with a Colombo process timezone.
- `repair-migration-timestamps.mjs` defaults to a read-only plan. It accepts only the observed timestamp differences, refuses any business-field or key mismatch, requires an explicitly pinned target host, and applies compare-and-swap updates atomically with full-row verification. `--rollback` verifies without committing. Test on a production copy before applying to Production.
- Timestamp repair was tested on `timestamp-repair-verification-20260918` (`br-hidden-field-azyrtyul`), then committed atomically to Production: **988 rows across 23 tables**, with full-row checks confirming only the planned timestamps changed. Production's RLS flags and restricted RPC privileges were rechecked. The original test branch and this production-copy branch remain available for verification; neither was deleted.
- Final read-only `verify-cutover.mjs` run after that commit passed: **all included table row counts and content hashes match Supabase**, including permissions and repaired timestamps. The explicitly excluded customer-book tables remain excluded; this is not a claim that those records were migrated.
- Storage SHA-256 comparison now passes for the source branding file in Production, Preview and Development. The other two source buckets contained no files. Existing matching objects were not overwritten.
- Verification: 202 web tests, web/database/mobile type checks, lint, and an optimized Next.js build passed. The build retains an existing `unpdf` import-meta warning. Expanded RLS checks on the isolated verification branch passed, including 120 concurrent cross-factory reads, denied privileged RPCs and cross-tenant CRUD. These do not replace deployed account/device/job workflow smoke tests.
- Release remains pending: Vercel storage/cron environment setup, scoped code review and authorized commit/push, then Preview and Production smoke tests. Browser control could not open the signed-in Vercel settings, so those environment changes remain unapplied. Keep Supabase available until all release gates pass; no Supabase shutdown or production application cutover has been performed. The timestamp repair targeted Production only; existing development/preview data was not reset from Production.

## 2026-09-17 - Neon data layer, field app and storage

- **`pnpm db:migrate` on a Neon host now also applies `packages/db/neon/`**: `000_prelude.sql` before the Drizzle migrations, `002_grants.sql` and `003_request_identity.sql` after. All three are idempotent. Preview and Production pick them up on their next build through `scripts/vercel-build.sh`.
- **`003_request_identity.sql` fixes silent empty results under load.** Calling pg_session_jwt's `auth.uid()` on a backend that has not loaded the extension yet wipes `request.jwt.claims` for that transaction. At ~40+ concurrent Data API requests, 10–45% ran with no user, so RLS returned empty rows (never another factory's). The file adds `public.request_uid()`, which reads `sub` from `request.jwt.claims`, and rewrites every public function and policy that called `auth.uid()` to use it. The Data API rejects forged, tampered, wrong-key and expired JWTs (HTTP 400) before the query reaches Postgres, so the claims setting is trustworthy. After the fix: 600/600 correct across two factories with fresh backends. `db:verify-tenant-invariants` fails if any function or policy calls `auth.uid()` again.
- **`get_email_for_login` is no longer executable by `authenticated`, `anon` or `anonymous` on Neon.** Web (`app/login/actions.ts`) and mobile (`/api/mobile/sign-in`) resolve usernames server-side through `NEON_DATABASE_URL`, so the lookup cannot be used to enumerate staff emails.
- **Field app (apps/mobile) is Neon-only, username + password only.** OTP tabs are gone. New env: `EXPO_PUBLIC_API_BASE_URL` (the web deployment) and `EXPO_PUBLIC_NEON_DATA_API_URL`. `.env.production` now points to the production web URL; deploy and verify the Neon-backed web API before shipping the mobile release.
- **Mobile auth goes through the web app** because Neon Auth has no bearer-session support: `POST /api/mobile/sign-in` returns an opaque session (kept in expo-secure-store) plus a JWT; `POST /api/mobile/token` exchanges the session for a fresh JWT; `POST /api/mobile/sign-out` ends it. Data API calls use the JWT and `x-device-id` exactly as before.
- **Supplier photos and bank books upload straight to Neon object storage** via `POST /api/mobile/supplier-documents`, which applies the old `storage.objects` policies (factory folder; owner/manager/supervisor, or a field officer on the bound phone; field officers cannot overwrite; delete is owner/manager) and returns a 5-minute presigned PUT URL. Content type and exact size are signed into the URL, so the 10 MB limit and image MIME list hold, and the image never passes through a Vercel function body limit.
- **Web storage** uses `lib/db/storage.ts` (`storageFor(supabase, factoryId)`), backed by `lib/neon/storage.ts` on Neon. Every web, preview and production environment needs `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION` from `neon env pull --service object-storage` for its own branch. Buckets are not inherited by branches that already existed, so create `factory-branding`, `auction-documents` and `supplier-documents` on each branch.
- **Background jobs on Neon run as a per-factory job identity** (`lib/neon/job-identity.ts`, email `job-runner+<factory>@jobs.invalid`, password derived from `JOBS_TICK_SECRET`), because Neon cannot mint a token for another user. RLS still scopes every row. The queue bookkeeping (sweep, fail, claim) uses the owner connection in `lib/db/jobs-admin.ts`.
- **Disable public sign-up in the Neon Auth console** for every branch. Accounts are created only from User management.

## 2026-09-17 - Neon and Vercel branch mapping

- Push `main` -> Vercel Preview -> Neon `preview-branch` (`br-autumn-snow-aztpk3of`).
- Push `blm-cloud-release` -> Vercel Production -> Neon `production` (`br-fancy-bar-az4b6zgd`). Local development remains `development-01`.
- Vercel's Production Branch must be `blm-cloud-release`, Root Directory `apps/web`. The checked-in ignore command now permits both deployment branches.
- Both Vercel environments now have separately scoped `NEXT_PUBLIC_DATA_BACKEND=neon`, `NEON_DATABASE_URL` (pooled app connection), `NEON_AUTH_BASE_URL`, `NEXT_PUBLIC_NEON_AUTH_BASE_URL`, and `NEXT_PUBLIC_NEON_DATA_API_URL` from their respective Neon branches. Keep secrets server-only. The build derives a direct migration `DATABASE_URL` from the validated `NEON_DATABASE_URL`; the legacy shared `DATABASE_URL` is not used to choose the migration destination.
- `scripts/verify-deployment-env.mjs` checks the Git branch and exact DB/Auth/Data API hosts before migrations. Both Preview and Production run pending migrations against their own database before building. Turbo receives the deployment environment and forces a fresh build to prevent reuse of browser bundles containing another branch's endpoints.
- Neon Auth trusted domains and environment-specific `NEXT_PUBLIC_SITE_URL` are configured for `https://tea-factory-board-leaf-project-web.vercel.app` (Production) and `https://tea-factory-board-leaf-project-web-git-main-glm-project.vercel.app` (Preview). Use these stable origins for sign-in. Rebuild from the release branch for Production; do not promote a Preview artifact with Preview credentials embedded in it.
- Remote branch tracking and environment configuration were completed through authenticated Chrome access. The checked-in `vercel.json` supplies the build command. Repository changes remain uncommitted/unpushed; no deployment was triggered or verified in this setup task. Push the migration code with these guards before testing deployments. Storage credentials required by the separate storage migration were not configured in this task.

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
- **No job has a time limit, and `/api/jobs/tick` declares no `maxDuration`.** Declaring one could only shorten the invocation: with fluid compute (default) Hobby's default *and* maximum are both **300s**, so the `export const maxDuration = 60` that used to sit there cut every chunk to a fifth of what was already allowed — five times the handovers, five times the chances for the chain to break. The chunk yields at **240s** of that 300s and always leaves a cursor behind, which is what turns a bounded invocation into an unbounded job. If chunks ever come back short, check **Settings ▸ Functions ▸ Default Max Duration** — a project-level default overrides the platform one. `LEASE_SECONDS` is 360, and must always exceed a whole chunk or a slow chunk has its run stolen and units are applied twice.
- **A run whose worker was killed is declared interrupted rather than left saying "In progress".** The poll restarts a run that has been quiet for 30s (free to over-fire: the claim only takes a run whose lease has lapsed, so a tick aimed at a working chunk claims nothing). If it is still quiet after 3 minutes **and its lease has lapsed**, it is marked `failed` with "Interrupted after N of M". The lapsed lease is what makes this safe — a live worker holds one for its whole chunk, so silence alone is never treated as death, which is exactly what the old two-minute heartbeat got wrong. The cursor is kept, so **Execute** resumes rather than restarting.
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

## 2026-08-19 - Settlement And VAT Upsert Conflict Targets

- Migration `0053_true_stryfe.sql` replaces `idx_settlement_charges_settlement`
  with a UNIQUE index `uq_settlement_charges_code` on
  `settlement_charges(settlement_id, code)`, and `idx_vat_ledger_sale_line`
  with a UNIQUE index `uq_vat_ledger_sale_line_flow` on
  `vat_ledger(sale_line_id, flow)`. Both replace a plain lookup index, so no
  index is lost.
- Why: the sellers-contract confirm path upserts both tables with
  `ON CONFLICT (settlement_id, code)` and `ON CONFLICT (sale_line_id)`, but no
  unique index backed either target. Postgres rejected every such statement
  with `42P10`, so `settlement_charges` and `vat_ledger` were never populated
  since they were introduced in `0012`. The errors were discarded by the
  action, so the confirm reported success.
- The `vat_ledger` conflict target moved from `sale_line_id` to
  `sale_line_id,flow`, keeping the documented seam for a future
  `auction_input` row alongside the `auction_output` one.
- The migration deletes pre-existing duplicates (keeping the newest row per
  key) before creating each unique index, so it is safe to apply to an
  environment that already holds rows. The local stack held zero rows in both
  tables, which is itself the evidence the upserts never succeeded.
- No package dependency was added or changed.
- Verification checklist for this change:
  - apply migrations through `0053_true_stryfe.sql`;
  - confirm a sellers contract and check `settlement_charges` and `vat_ledger`
    now hold rows, and that re-confirming the same document updates rather
    than duplicates them;
  - run `pnpm --dir packages/api test:contract`;
  - run `db:verify-rls` and `db:verify-auth`;
  - run the repo lint and typecheck commands.

## 2026-09-03 - Field Customer Registration (Lines, Devices, Documents)

- Migration `0065_smiling_star_brand.sql` adds `vehicles`, `drivers`, `lines`,
  `line_drivers` and `user_devices` (all `factory_id`-scoped with the standard
  `factory_isolation` policy, except `user_devices` which is narrowed to
  own-row reads plus management writes), and extends `suppliers` with
  `customer_no`, `line_id`, `cultivated_area_acres`, `address`,
  `location_accuracy_m`, `location_captured_at`, `photo_path`,
  `bank_book_path`, `bank_account_no`, `bank_name`, `bank_branch`,
  `bank_parse_status`, `registered_by_user_id`, `registered_at` and
  `client_uuid`.
- `customer_no` is the identifier the customer already carries in the factory's
  existing system. It is text (leading zeros and prefixes must survive) and
  unique per factory, so a second registration of the same number is refused by
  the database.
- The migration also adds `public.current_device_id()`,
  `public.device_is_bound()` and `public.register_device(...)`, plus a
  RESTRICTIVE policy `field_officer_device_bound` on `suppliers`. A
  `field_officer` login writes only from the phone it is bound to; every other
  role is unaffected. The device id travels as an `x-device-id` request header,
  which PostgREST exposes through `request.headers` — verified against the
  local stack rather than assumed.
- **Drizzle emits composite foreign keys before the unique indexes they
  reference**, so `0065` was hand-reordered to create
  `uq_vehicles_factory_id`, `uq_drivers_factory_id` and `uq_lines_factory_id`
  ahead of the `ALTER TABLE ... ADD CONSTRAINT` block. Regenerating this
  migration would reintroduce the failure (`42830`).
- Migration `0066_supplier_documents_bucket.sql` is hand-written (journal entry
  added manually) and creates the private `supplier-documents` storage bucket,
  10 MB limit, JPEG/PNG/WebP/HEIC, pathed `factory_id/supplier_id/*.jpg`.
- New base role `field_officer` in `apps/web/lib/roles.ts` and the `users.role`
  enum. It appears in `CUSTOMIZABLE_BASE_ROLES` so owners can create the login,
  and in no `MODULES`/`PAGE_DEFINITIONS` entry, so it reaches no web page.
- New web pages: `/dashboard/lines` (+ `[id]` detail for driver assignment),
  `/dashboard/vehicles`, `/dashboard/drivers`, and
  `/dashboard/user-handling/devices` for releasing a bound phone.
- `apps/mobile` gains `expo-secure-store`, `expo-location`,
  `expo-image-picker` and `expo-application`; `app.json` declares the camera
  and location permission strings. The Supabase client now wraps `fetch` to
  attach `x-device-id` to every request.
- New gate `pnpm --dir packages/db db:verify-device-binding`.

## 2026-09-03 - Mandatory Customer Fields (DESTRUCTIVE)

- **Migration `0067_customer_mandatory_fields.sql` DELETES EVERY CUSTOMER ROW**
  and every dependent `payment_lines`, `payments`, `supplier_adjustments`,
  `supplier_tiers`, `supplier_requests`, `supplier_messages` and `weighings`
  row, and nulls `users.supplier_id`, before making `customer_no`, `phone`,
  `latitude` and `longitude` NOT NULL. Requested explicitly; the concern about
  the hosted database was raised and the full wipe was confirmed. **Do not
  merge to `blm-cloud-release` while any leaf-handling data matters.**
- `uq_suppliers_factory_customer_no` drops its `WHERE customer_no IS NOT NULL`
  clause (the column can no longer be null), and four CHECK constraints reject
  blank numbers/phones and out-of-range coordinates.
- The web create form gained required Latitude/Longitude inputs — office staff
  cannot read GPS, so coordinates are typed there; the field app still captures
  them from the device. `friendlyError` now names the offending column for
  `23502`, and maps the new `23514` check constraints.
- `db:seed` now inserts the built-in `access_roles` set (owner, manager,
  supervisor, accountant, collector, field officer) per factory. The truncate
  cascades that table away, so a re-seed used to leave the factory with zero
  roles — failing `verify-rls` and wiping any role an owner had configured in
  the app. The seeded roles carry no `role_page_permissions` rows on purpose:
  no grants means "not yet configured", and seeded users have no
  `access_role_id` so they fall back to base-role defaults regardless.
- `db:seed` now REFUSES a non-local `DATABASE_URL`. It truncates the factory
  book, and has already destroyed a set of hand-configured roles once.
- `db:link-auth` set `users.username` BEFORE copying the row to its auth id,
  so the copy collided with `users_username_key` and the whole script aborted
  after any re-seed. The username is now written once the duplicate row is
  gone, and the relink repoints `drivers`, `user_devices` and
  `suppliers.registered_by_user_id` alongside `collectors`.
- `access_roles.base_role` accepts `field_officer` (TS enum on a text column;
  no migration needed).
- Verification checklist for this change:
  - apply migrations through `0067_customer_mandatory_fields.sql`;
  - `db:seed`, then `db:link-auth`, then `db:verify-rls`, `db:verify-auth` and
    `db:verify-device-binding`;
  - confirm a customer cannot be saved without number, mobile or coordinates
    from either the web form or the field app;
  - run the repo lint and typecheck commands.
- Verification checklist for this change:
  - apply migrations through `0066_supplier_documents_bucket.sql`;
  - run `db:verify-rls`, `db:verify-auth` and `db:verify-device-binding`;
  - run the repo lint and typecheck commands.
