# Environment, Install, And Migration Change Log

Use this file to track changes that matter when hosting or rebuilding the project in a new environment.

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
