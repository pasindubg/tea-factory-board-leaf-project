# Handoff prompt 1 — Dispatch-first redesign + cross-sale dashboard

> Paste this whole file into a fresh Claude Code chat (or say: "read
> docs/handoff/01-dispatch-first-redesign.md and do it"). Do this task FIRST,
> then move to `docs/handoff/02-orphan-resolver-and-bank-recon.md`.

## Orientation (read before touching code)
- Project: **Tea Factory Ops**, `~/Desktop/board-leaf-project`. Invoke the
  **`tea-factory-ops` skill** and read `docs/PRODUCT.md`, `MILESTONES.md`, and
  **`docs/AUCTION.md`** (the auction spec) before acting.
- **Work in the MAIN checkout** on branch `pasindu/auction-flow-reconsiliation`.
  **Do NOT create git worktrees** — the user wants all development in the main
  working tree.
- Toolchain (from the skill): Node 20.20 via nvm — prepend
  `export PATH="/Users/pasindu/.nvm/versions/node/v20.20.2/bin:/Users/pasindu/.npm-global/bin:$PATH"`
  for any node/pnpm command. `db:*` scripts need `.env` sourced first
  (`set -a; . ./.env; set +a`). **No `psql`** — migrations are applied directly
  via a small transactional tsx script using the `postgres` client (split the
  generated `.sql` on `--> statement-breakpoint`, run each in `sql.begin`), and
  the **RLS `factory_isolation` policy block is hand-appended** to each generated
  migration (see existing migrations `0010`–`0013` for the exact pattern).
  Migration **`0013` is a status-transition TRIGGER on auction lots** — read it;
  any code that changes a lot's `state` must produce a transition the trigger
  allows (extend the trigger if you add states like `re-print`/`pending`).
- The app is **light + dark themed** (Tailwind `stone`/`green` with `dark:`
  variants). Match it.
- Verify with: `pnpm turbo typecheck`, `pnpm --dir packages/db db:verify-rls`,
  the api tests (`pnpm --dir packages/api test:auction` etc.), and a `preview_*`
  walk-through. NOTE: the Supabase **auth** endpoint (Mumbai) is flaky from this
  machine, so logged-in browser e2e is unreliable — prefer verifying data paths
  with rolled-back DB integration scripts (see how earlier A-track work was
  verified), plus `db:verify-rls`.

## Current state (what already exists, A1–A4 committed)
- Auction module: `apps/web/app/dashboard/auction/` — `page.tsx` (sales list),
  `new/page.tsx` (**create sale** — to be redesigned), `registry/page.tsx`
  (brokers & marks), `[saleId]/page.tsx` (detail: invoiced-lot entry + doc
  ingestion sections), `[saleId]/{ack,valuation,contract}/[importId]/page.tsx`
  (review screens), `actions.ts`, `auction-nav.tsx`, `layout.tsx`.
- Schema (`packages/db/src/schema/`): `auction-sales`, `auction-lots`,
  `valuations`, `buyers`, `sale-lines`, `settlements`, `settlement-charges`,
  `vat-ledger`, `bank-transactions`, `broker-rates`, `brokers`, `marks`,
  `doc-imports`.
- Pure logic (`packages/api/src/auction/`): `parse-acknowledgement`,
  `parse-valuation`, `parse-contract`, `parse-bank-csv`, `compute-settlement`,
  `reconcile` (①), `reconcile-valuation` (②), `reconcile-vat` (③),
  `reconcile-bank` (④), `match-orphans` (orphan-resolver scoring).
- Sample real documents: `~/Desktop/custo-tokanizer-onix/ktf-auc-fll/`
  (Acknowledgement / Valuation / Sellers Contract PDFs + a bank-statement CSV)
  for Sale **2026-023**, broker **BPML**, marks **MF1530 KUMUDU / MF1530A
  ITTAPANA**.

## The problem with the current model
The current model assumes the **factory creates a Sale up front** (`new/page.tsx`
= "Create sale", lots hang off a pre-created `auction_sales` row). **That is
wrong.** The real flow is dispatch-first:

```
factory dispatches lots → 3rd-party STORE → auction catalogues a SUBSET
(Acknowledgement) → Valuation → Sale → unsold lots are RE-PRINTED (re-sampled,
slight kg loss) → roll to the NEXT sale (~3 weeks later)
```

The factory never makes a sale; the broker does. The factory only **dispatches**.

## Domain rules to encode
1. **Lot + invoice are the keys.** A lot has a **lot number** and **invoice
   number**. Usually one invoice per lot, but **rarely a lot maps to multiple
   invoices** — the model must support 1-lot-to-many-invoices (recommended: a
   `lot_invoices` child table `{lot_id, invoice_no}`, common case = a single row;
   keep a denormalized primary `invoice_no` on the lot if convenient, but treat
   the child table as source of truth). Parsers/reconcilers/UI must key on
   (lot_no, invoice_no) and tolerate multi-invoice lots.
2. **Bags per lot vary** — typically 10/15/20 (set by the auction provider); rare
   grades may have 1–3 bags. Already modelled (`bags`); keep.
3. **Acknowledgements are PARTIAL.** Not all dispatched lots appear in one ack —
   e.g. lots 4 and 8 may be acknowledged in a *later* ack while the current ack
   has all the others. So a dispatched lot **absent from the current ack is NOT
   automatically "missing/lost"** — it may be **pending** (still at the store,
   will appear in a later ack / roll to a later sale). Reconciliation ① must
   distinguish **pending (not yet acknowledged)** from **genuinely missing**, and
   a partial ack must not flag the rest as errors.
4. **Sale number is captured at dispatch.** The factory enters the **target sale
   number up front** on each lot record. The `auction_sales` row is created/linked
   lazily by that sale_no and is only **populated with sale details after the
   sale** (broker contract). Lots can change their target sale (re-print → next
   sale), so a lot's sale association can move.
5. **Post-sale lot states:** after a sale a lot becomes **`sold`** or
   **`re-print`** (unsold → re-sampled, ~−sample kg, rolls to the next sale).

## What to build
1. **Rename "Create sale" → "Create dispatch."** `new/page.tsx` (and nav/labels)
   become a **dispatch** flow. The factory creates **lot records**, each with:
   lot number, invoice number(s), grade, bags, kg/bag (→ net wt), broker/mark, and
   the **target sale number** (entered up front). No sale is "created" as a sale.
2. **Lot ↔ invoice 1:many.** Add the `lot_invoices` child table (+ migration +
   RLS) and update the create-dispatch UI to allow adding 1+ invoice numbers per
   lot (default 1). Update parsers/reconcilers that currently assume a single
   `invoice_no`.
3. **Move the add-lot form to the TOP** of the lots table on the dispatch detail
   page (currently it's at the bottom — move it up; cleaner UI).
4. **Lot lifecycle:** `dispatched → catalogued (ack) | pending → valued →
   sold | re-print`. Update the status-transition trigger (`0013`) accordingly.
   Re-print rolls the lot to the next sale (new target sale_no, sample kg
   deducted, audit the roll).
5. **Sales become post-sale records** keyed by sale_no: created/linked when a lot
   references the sale_no; populated with broker/sale details after the contract
   is ingested. Update `auction_sales` usage so the list/detail reflect dispatch
   → catalogued → valued → sold/settled.
6. **Reconciliation ① refinement:** partial-ack aware. "missing" splits into
   **pending** (dispatched, not in this ack — fine, may roll forward) and
   **unresolved/missing** (expected and overdue). Don't penalize partial acks.
7. **Cross-sale dashboard:** a new page (e.g. `/dashboard/auction` overview or a
   dedicated tab) visualizing highlights + details **across all lots & sales** —
   e.g. lots by status (dispatched/pending/catalogued/valued/sold/re-print/
   shutout), kg & proceeds by sale, realised-vs-valuation premium, VAT cash-vs-
   guarantee outstanding, settlement/bank status, and re-print roll-forward. Use
   the existing reconcilers for the numbers. Keep it light + dark themed.

## Conventions (do not violate)
- Every new table: `factory_id` + index + RLS `factory_isolation` policy in the
  creating migration; `numeric` for money/weight; follow the existing schema-file
  + `index.ts` re-export pattern.
- Pages gate via `requireModuleAccess("auction")`; actions via
  `requireProfile(getDefaultRoles("auction"))`; access registry is
  `apps/web/lib/roles.ts`. Module is grouped under "Sales Handling" in the nav.
- Keep `docs/AUCTION.md`, `MILESTONES.md`, the skill, and project memory in step
  with the model change.

## Acceptance
- Create-dispatch flow lets the factory enter lots (lot no, invoice no(s), bags,
  grade, kg/bag, target sale no) with the add form at the top; supports a
  multi-invoice lot.
- Ingesting the Sale-023 Acknowledgement against a dispatch with extra
  not-yet-acknowledged lots leaves those as **pending**, not missing.
- A sale shows its lifecycle; unsold lots can be marked **re-print** and roll to a
  next sale with kg adjustment + audit.
- Dashboard renders cross-sale highlights.
- `pnpm turbo typecheck` clean; `db:verify-rls` passes; migrations applied; key
  api tests still green.

Once this base is solid, proceed to `docs/handoff/02-orphan-resolver-and-bank-recon.md`.
