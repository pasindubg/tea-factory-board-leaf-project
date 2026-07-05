---
name: ai-insights
description: Implementation playbook for the AI Insights & Business Analytics module (AI-track AI1–AI4) of Tea Factory Ops. USE THIS SKILL whenever building, extending, or debugging anything under packages/api/src/insights, apps/web/lib/insights, apps/web/app/dashboard/insights, apps/web/app/api/insights, insight-related tables (insights, insight_runs, metric_snapshots, insight_feedback, insight_settings), analyzers/rules, the weekly digest, or the LLM insight agent. Also when adding insight support for a new ERP module.
---

# AI Insights — implementation playbook

Two documents are the contract — read them before writing code:
- **[docs/AI_INSIGHTS.md](../../../docs/AI_INSIGHTS.md)** — architecture &
  functional spec (v2): funnel, ScopedDb tenancy, DDL, EvidencePack contract,
  LLM pipelines, statistical methodology, UI spec, future applications.
- **[docs/AI_INSIGHTS_IMPLEMENTATION.md](../../../docs/AI_INSIGHTS_IMPLEMENTATION.md)**
  — task-level plan (T1–T23), fixture inventory, exit gates per phase.

If spec and skill disagree, the spec wins (then fix this skill). Build in
T-number order; do not reorder across phases.

## The one-paragraph mental model

Three layers, strict funnel: **L1 analyzers** (pure, registered, versioned,
fed a ScopedDb, output ≤3 KB evidence packs where every LKR figure carries a
`formula` string) → **L2 rules** (deterministic thresholds with `minSamples`
and `cooldownDays` → `insights` rows; zero LLM) → **L3 LLM** (Haiku notes,
Sonnet digest/agent; sees packs only; citation-validated; budgeted; cached by
`evidence_hash`). `insight_runs` doubles as the job queue (SKIP LOCKED).
Most insights are L2-only. Every insight: fact + LKR impact + action.

## Hard rules (violating any of these = wrong implementation)

1. **No raw table data in prompts.** L3 receives evidence packs only.
   Free-text user strings (notes, tasting notes) live quarantined in
   `pack.quotes[]` and are treated as untrusted data.
2. **Analyzers never get a raw DB client.** They receive `ScopedDb`
   (auto-injects `factory_id`, exposes only the tables declared in the
   registry entry's `reads:`). Worker paths connect as `insights_worker` with
   `SET LOCAL app.factory_scope` (spec §4.4 — two walls, both mandatory).
3. **Every derived LKR figure carries its formula** in
   `pack.money[] = {key, lkr, formula}`. The UI shows the why.
4. **LLM output passes the citation validator or is discarded** (spec §5.2):
   every number in a note/digest/answer must exist in the packs; on failure
   keep the L2 templated text and log `validation_failed`. The model arranges
   numbers; it never invents them.
5. **Every rule declares `minSamples` and `cooldownDays`.** Below the sample
   floor → silent (cold start is silence, not noise). Cooldown/hysteresis per
   spec §6; dismiss doubles the cooldown.
6. **New tables get `factory_id` + RLS in the same migration**, and
   `db:verify-rls` gains positive AND negative worker-GUC tests in the same
   PR. The drizzle runner is non-standard — apply migrations manually
   (postgres-js script + record hash in `drizzle.__drizzle_migrations`); never
   blind `drizzle-kit migrate`.
7. **No `ai_note` columns on domain tables** — flags/notes come from joining
   `insights` by (`entity_type`,`entity_id`) (spec §4.5 explains why).
8. **Analyzers/rules/hash/stats/validator are pure and fixture-tested** in
   `packages/api` (`test:insights`, no live DB — stub ScopedDb over fixture
   arrays). Suite green before any UI work.
9. **Event hooks never block business actions**: enqueue inside `after()` at
   the END of the confirm actions; a failed enqueue is swallowed and logged.
   Idempotency via `UNIQUE(factory_id, kind, entity_id, evidence_hash)`.
10. **Budget + cache before any L3 feature ships**: per-factory monthly token
    budget, degradation ladder full→digest-only→rules-only (L1/L2 never stop),
    spend recorded per run, `insight_settings.enabled=false` kill switch.
11. **Access**: module `insights` in `lib/roles.ts` (owner|manager, entitlement
    `insights`); mutations re-check the insight row's factory. Never inline
    role checks.
12. **Models & keys in ONE config module** (`apps/web/lib/insights/config.ts`):
    `claude-haiku-4-5-20251001` (notes), `claude-sonnet-4-6` (digest/agent).
    `ANTHROPIC_API_KEY` + `INSIGHTS_CRON_SECRET` are server-only env.

## File map

```
packages/api/src/insights/
  types.ts hash.ts stats.ts validate.ts registry.ts
  analyzers/{auction,suppliers}.ts   rules/{auction,suppliers}.ts
  insights.test.ts                   (pnpm --dir packages/api test:insights)
apps/web/lib/insights/
  db.ts (ScopedDb) runner.ts (queue lifecycle) agent.ts (L3) config.ts
  sql-tool.ts (AI3)
apps/web/app/api/insights/{run,cron}/route.ts
apps/web/app/dashboard/insights/{page.tsx,actions.ts,insights-table.tsx}
packages/db/src/schema/{insights,insight-runs,metric-snapshots,
                        insight-feedback,insight-settings}.ts
packages/db/drizzle/00XX_insights.sql   (tables + RLS + worker/sql roles)
```

## Build order

**AI1** T1–T13 (schema/roles → verify-rls → engine skeleton → ScopedDb →
8 analyzers → 8 rules → runner/queue → routes → event hooks → inbox → row
badges → fixtures → doc sync). **AI2** T14–T19 (config/budget → citation
validator → notes → digest → UI → customer-zero pilot). **AI3** T20–T23
(agent loop → guarded SQL → ask-the-analyst → feedback). **AI4** per
implementation doc (packing advisor and what-if simulator are deterministic
and can ship early — the what-if reuses `computeSettlement` as-is).

Exit gates per phase are in the implementation doc — do not skip them.

## Adding insight support for a NEW ERP module (the recipe)

Spec §9, 5 steps: analyzer file + fixtures → register in `ANALYZERS`
(`triggers`, `reads`, `paramsSchema`, `llmTool`) → rules in `RULES`
(`minSamples`, `cooldownDays`, impact math) → optional `insightsByEntity` on
its list table → done. Inbox, digest, agent tools, budgets, RLS inherit.
If you're editing engine core to add a module, you're doing it wrong.

## Environment traps (they will bite)

- Node 20.20.2 via nvm: prepend
  `export PATH="/Users/pasindu/.nvm/versions/node/v20.20.2/bin:/Users/pasindu/.npm-global/bin:$PATH"`.
- `db:*` scripts don't load `.env` — `set -a; . ./.env; set +a` first.
- `DATABASE_URL` = session pooler host (direct host is IPv6-only, unreachable).
- Never run a second dev server against `apps/web/.next` (corrupts the chunk
  manifest); use the existing :3000 / preview tools.
- `numeric` columns arrive as strings — `Number(...)` at the edge, arithmetic
  never on strings.
- Clean up any test rows created in the real Supabase DB.

## Domain reminders that shape correct insights

- Acknowledgements are PARTIAL: `pending` lots are normal, not errors.
- Supplier wording follows superleaf loss-aversion: ALWAYS "bonus
  missed/earned", never "penalty" (PRODUCT.md rule) — S-3 copy matters.
- Settlement aging keys off `prompt_date` + the existing grace-window constant
  (see bank review page) — reuse, don't reinvent.
- A dispatch's sale identity is `sale_no` OR `target_sale_no`, normalized via
  `apps/web/app/dashboard/auction/sale-number.ts` — per-sale grouping must use
  it (invoice/lot numbers are normalized via `formatFourDigitNo`).
- Min-kg auto-shutout already happens at lot entry (`updateLot`/thresholds) —
  A-1's job is the *trailing pattern* and cross-lot packing advice, not
  re-flagging single lots.
- Windows/aging computed in Asia/Colombo, not UTC.
