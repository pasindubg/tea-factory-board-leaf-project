---
name: ai-insights
description: Implementation playbook for the AI Insights & Business Analytics module (AI-track AI1–AI4) of Tea Factory Ops. USE THIS SKILL whenever building, extending, or debugging anything under packages/api/src/insights, apps/web/app/dashboard/insights, apps/web/app/api/insights, insight-related tables (insights, insight_runs, metric_snapshots, insight_feedback), analyzers/rules, the weekly digest, or the LLM insight agent. Also when adding insight support for a new ERP module.
---

# AI Insights — implementation playbook

**The spec is [docs/AI_INSIGHTS.md](../../../docs/AI_INSIGHTS.md). Read it
before writing any code — it is the contract.** This skill is the operational
layer: conventions, file map, build order, and the traps. If spec and skill
disagree, the spec wins (then fix this skill).

## The one-paragraph mental model

Three layers, strict funnel: **L1 analyzers** (pure SQL/TS, registered,
output ≤3 KB evidence packs with `formula` strings for every LKR figure) →
**L2 rules** (deterministic thresholds → `insights` rows, zero LLM) →
**L3 LLM** (Claude tool-use agent that only ever sees packs, writes AI notes +
weekly digest, budgeted + cached by `evidence_hash`). Most insights are L2-only.
Never send raw rows to the model. Every insight: fact + LKR impact + action.

## Hard rules (violating any of these = wrong implementation)

1. **No raw table data in prompts.** L3 receives evidence packs only. Pack
   strings from user data (notes, tasting notes) go in a `quotes` field and are
   treated as untrusted data.
2. **Every derived LKR figure carries its formula** in the pack
   (`"formula": "920kg × Rs360/kg = Rs331,200"`). The UI shows the why.
3. **New tables get `factory_id` + `factory_isolation` RLS in the same
   migration.** Extend `db:verify-rls` in the same PR. The drizzle runner is in
   a non-standard state — apply migrations manually (postgres-js script,
   record hash in `drizzle.__drizzle_migrations`), do NOT run
   `drizzle-kit migrate` blindly.
4. **No `ai_note` columns on domain tables.** Row flags/notes come from joining
   `insights` by (`entity_type`,`entity_id`) — spec §3.2 explains why.
5. **Analyzers/rules are pure and fixture-tested** in `packages/api`, same
   style as `test:auction` etc. Add a `test:insights` script; it must pass
   before any UI work.
6. **Engine writes happen only through the job wrapper** (insights +
   insight_runs). Analyzers never mutate; the agent never mutates.
7. **Budget + cache before shipping any L3 feature**: per-factory token
   ceiling, `evidence_hash` skip, run accounting in `insight_runs`. A cap
   overrun degrades to rules-only — it never disables L1/L2.
8. **Idempotent inserts** via `unique(factory_id, kind, entity_id,
   evidence_hash)`; re-analysis of unchanged data is a no-op, changed data
   supersedes (`superseded_by`).
9. **Access**: register module `insights` in `lib/roles.ts` (roles
   owner|manager, entitlement `insights`); actions gate with
   `requireModuleAccess("insights")`. Never inline role checks.
10. **Models & keys**: ids live in ONE config module —
    `claude-haiku-4-5-20251001` (per-entity notes), `claude-sonnet-4-6`
    (digest/agent). `ANTHROPIC_API_KEY` is server-only env; never
    `NEXT_PUBLIC_`.

## File map (create in this shape)

```
packages/api/src/insights/
  types.ts            EvidencePack, Scope, InsightDraft, Severity, config types
  registry.ts         ANALYZERS[] + RULES[] (the extensibility contract, spec §3.3)
  analyzers/
    auction.ts        A-1..A-10 (spec §2.1)
    suppliers.ts      S-1..S-7 (spec §2.2)
  rules/
    auction.ts        settlement-overdue, minkg-shutout-risk, weight-shrinkage,
                      valuation-premium-by-grade, deduction-leakage
    suppliers.ts      supply-drop, water-penalty-repeat, advance-overexposure
  insights.test.ts    fixture tests (pnpm --dir packages/api test:insights)
apps/web/app/api/insights/
  run/route.ts        POST { trigger, scope } — event + manual entry point
  cron/route.ts       shared-secret cron endpoint (weekly digest)
apps/web/app/dashboard/insights/
  page.tsx            inbox (reuse components/list-controls for filters)
  actions.ts          ack / dismiss / feedback / analyze-now
apps/web/lib/insights/
  agent.ts            L3 loop (AI2+): registry-as-tools, budget, cache
  config.ts           models, budgets, thresholds defaults
packages/db/src/schema/
  insights.ts, insight-runs.ts, metric-snapshots.ts, insight-feedback.ts
packages/db/drizzle/00XX_insights.sql   (tables + RLS, one migration)
```

## Build order (matches spec §4 — do not reorder)

**AI1 (rules only):** schema+RLS → types/registry → 2 analyzers + 8 rules with
fixtures → job wrapper + event hooks at the END of confirm actions
(fire-and-forget, never block the user path) → inbox page → row badges on
Suppliers + Dispatches Overview (optional `insightsByEntity` prop on the
existing tables). Gate: fixtures fire/stay-silent correctly, hand-checked
impact math, `db:verify-rls` + `db:verify-auth` + typecheck green.

**AI2:** config/budget module → Haiku notes for flagged entities → Sonnet
weekly digest (X-1, X-3) → cache + budget tests. Gate: digest cites only
numbers present in packs; unchanged re-run = 0 tokens.

**AI3:** agent loop with registry tools → guarded `run_readonly_sql`
(SELECT-only role, allowlisted views, timeout, LIMIT+byte caps, full logging)
→ "Analyze now" / "Ask the analyst" → feedback + dismiss-rate report.

**AI4:** forecasts + cross-factory benchmarks (needs M7/M8 data; Phase-2
consent model for benchmarks).

## Adding insight support for a NEW ERP module (the recipe users will ask for)

Spec §5: analyzer file + fixtures → register in `ANALYZERS` (with `triggers`,
`paramsSchema`) → rules in `RULES` → optionally pass `insightsByEntity` to the
module's list table. Everything else (inbox, digest, agent tools, budget, RLS
pattern) inherits. If you find yourself editing the engine core to add a
module, you are doing it wrong.

## Environment traps (inherited from the repo — they will bite)

- Node 20.20.2 via nvm; prepend
  `export PATH="/Users/pasindu/.nvm/versions/node/v20.20.2/bin:/Users/pasindu/.npm-global/bin:$PATH"`.
- `db:*` scripts do NOT load `.env` — `set -a; . ./.env; set +a` first.
- `DATABASE_URL` uses the session pooler host (direct host is IPv6-only).
- Don't run a second dev server against `apps/web/.next` (corrupts the chunk
  manifest); use the existing :3000 server / preview tools.
- Money/weights are `numeric` → strings from postgres-js; `Number(...)` at the
  edge, never arithmetic on strings.
- Test data in the real Supabase DB must be cleaned up after verification.

## Domain reminders that shape correct insights

- Acks are PARTIAL: `pending` lots are normal, not errors (spec A-1 vs A-8).
- Superleaf framing: supplier suggestions are ALWAYS bonuses-missed/earned,
  never "penalties" (PRODUCT.md loss-aversion rule) — S-3 wording matters.
- Prompt date drives settlement aging; grace window exists (see bank review
  page's GRACE_DAYS) — reuse, don't reinvent.
- A dispatch's sale identity can be `sale_no` OR `target_sale_no` (normalized
  matching via `sale-number.ts`) — analyzers grouping "per sale" must use it.
