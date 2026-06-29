# Handoff prompt 2 — Orphan-resolver "Compare" panel + bank-recon UI (#18–#21)

> Paste this whole file into the chat (or say "read
> docs/handoff/02-orphan-resolver-and-bank-recon.md and do it") AFTER completing
> `docs/handoff/01-dispatch-first-redesign.md`. Also paste the **OrphanResolver
> React component from the previous chat** as the UI reference (the user has it) —
> the user explicitly wants that look kept.

## Orientation (same as prompt 1 — re-read it)
- Project Tea Factory Ops, `~/Desktop/board-leaf-project`, branch
  `pasindu/auction-flow-reconsiliation`, **main checkout, no worktrees**. Invoke
  the `tea-factory-ops` skill; read `docs/AUCTION.md`. Toolchain gotchas, the
  status-transition trigger (`0013`), direct migration apply, light+dark theme,
  flaky Supabase auth (verify via rolled-back DB integration not browser e2e) —
  all as in prompt 1.

## Already done (the foundation)
- **Scoring core is built & tested**: `packages/api/src/auction/match-orphans.ts`
  (exported from `@tea/api`). Pure, framework-free:
  - `rankCandidates(orphan, pool)` and `scoreCandidate(orphan, candidate)` →
    transparent per-dimension breakdown (`grade` via a Ceylon grade-family table,
    `weight` Δkg band, `lot` proximity when a hint exists), renormalized over
    present dims; **mark is a hard filter, never a score**; **nothing auto-links**.
  - Test: `pnpm --dir packages/api test:match` (for the OP1·280 missing-invoice
    case, lot 0481 ranks top ~90%, weight-exact family ~73%, cross-family lowest).
  Reuse this for Stage-1 (lot orphans). For Stage-3 (bank) write a sibling scorer
  with bank dimensions (broker-name keyword match, amount proximity, date-in-
  prompt-window) — same shape (`ScoredCandidate` with `dims`), different inputs.
- Recon ① screen: `apps/web/app/dashboard/auction/[saleId]/ack/[importId]/page.tsx`
  (server component). `reconcile.ts` yields `missing` (invoiced, has lot id) and
  `unexpected` (ack lot: lotNo/markCode/grade/netWt) rows — the two pools the
  Compare needs. NOTE: on `unexpected` rows the "Invoice" column is the
  **acknowledgement-parsed** invoice number, not the factory's.
- Bank recon **logic** is committed: `parse-bank-csv.ts`, `reconcile-bank.ts`
  (recon ④: matches a settlement's `total_net_proceeds` / cash-only /
  cheque-no to bank credits within a date window + tolerance), and an
  `ingestBankCsv` action in `actions.ts`. The `bank-transactions` table exists.
  **What's missing is the bank-recon REVIEW UI (Stage 3 screen) and the
  unattributed↔unpaid resolver.**

## Tasks

### #18 — Audit table + manual link/reject/mark server actions
- New table `auction_audit` (`+ migration + RLS`): `id, factory_id, sale_id?,
  lot_id?, action, detail, reason, actor (user id/name), confidence_shown
  (numeric, nullable), created_at`. Financial recon → **every manual decision
  must be traceable.**
- Server actions in `actions.ts`:
  - `linkOrphanLot(...)`: manually catalogue a `missing` invoiced lot to a chosen
    `unexpected` ack lot — set its lot_no/mark, advance state (respect the `0013`
    trigger), and **file the Δkg as a weight-mismatch** so the discrepancy isn't
    silently swallowed; write an `auction_audit` row (actor, candidate chosen,
    confidence shown, optional reason).
  - `markShutout`, `markMissing` / `markPending`, and a candidate `reject` — each
    audited. A confirmed link with nonzero Δkg always records the mismatch.

### #19 — "Compare" panel on the recon ① screen
- Add a **top-right "Compare" button** on the recon ① screen for the ambiguous
  rows (`missing` / `unexpected`). It opens a **side-by-side compare panel**:
  ranks the opposite-side candidates via `rankCandidates`, shows each candidate's
  **transparent per-dimension breakdown** + a confidence band/bar, with
  **Link / Reject** per candidate and orphan-level **Mark shut out / Mark
  genuinely missing / Leave unresolved**; a **confirm dialog warns when weights
  differ** (Δkg filed as a mismatch). An **audit trail** reads from
  `auction_audit`.
- **UI:** keep the look of the **OrphanResolver component from the previous chat**
  (the user likes it) — same layout/UX (orphan card, ranked candidate cards with
  per-dimension reasons + confidence bar, link/reject, orphan outcomes, confirm
  dialog with Δkg warning, audit list). **BUT re-theme** from its dark
  `neutral-950`/`emerald` palette to the app's **light + dark `stone`/`green`
  Tailwind** (use `dark:` variants like the rest of the auction pages). It must be
  a **client component** (`"use client"`) fed by real recon data from the server
  page, calling the #18 server actions. The pure scoring already lives in
  `match-orphans.ts` — import from `@tea/api`, don't re-implement.
- Example to validate against: a `missing` `OP1 · 280 kg` invoice should surface
  lot `0481` (`OP1·300`, grade exact, +20 kg) at the top and weight-exact-but-
  grade-off lots below — the user decides; nothing auto-links.

### #20 — Bank reconciliation review UI (Stage 3)
- Build the **bank-recon review page** driven by `reconcileBank` +
  `parse-bank-csv` + `ingestBankCsv`. Wire a **bank-CSV upload** into the
  sale/dashboard (parse → stage in `doc_imports` → review → confirm), like the
  other doc ingestions.
- Per sale show status: **settled / under-paid / over-paid / unpaid / unattributed**
  (tolerance ~Rs 100 or 0.1%). Reuse the **same orphan-resolver pattern** to link
  **unattributed bank credits ↔ unpaid settlements** (the dashed-line reuse from
  the pipeline plan — same compare UX, bank dimensions).
- Design for the edge cases: **partial/advance payments** (one sale, multiple
  credits over time → "settled" = cumulative ≥ expected within tolerance),
  **one transfer covering multiple sales** (split a credit across sales), and
  **timing** (money lands days/weeks after the sale → "unpaid" needs a prompt-date
  grace window before it's alarming). Bank narration is garbage (truncated free
  text) — never auto-commit a fuzzy match; suggest, human confirms, audit it.
- Sample to test against:
  `~/Desktop/custo-tokanizer-onix/ktf-auc-fll/Bank Transaction Details.csv`.
  (Note: that statement predates the Sale-023 prompt date 24/06, so a correct
  result is "expected, not yet received" — the recon must report that cleanly.)

### #21 — Verify
- `pnpm turbo typecheck`; `pnpm --dir packages/api test:match` (+ existing tests);
  a **rolled-back DB integration** proving a manual `linkOrphanLot` catalogues the
  lot, writes an audit row, and files the weight-mismatch; and that the bank-recon
  page renders/reconciles against the sample CSV. Clean up any test rows.

## Constraints
- Same conventions as prompt 1 (RLS per table, `numeric` money/weight, gate via
  the roles registry, keep docs + memory in step).
- Build Stage-1 (recon ① Compare) first and get it solid, then Stage-3 (bank)
  reusing the pattern.
