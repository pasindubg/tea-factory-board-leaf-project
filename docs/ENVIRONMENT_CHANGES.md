# Environment, Install, And Migration Change Log

Use this file to track changes that matter when hosting or rebuilding the project in a new environment.

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
