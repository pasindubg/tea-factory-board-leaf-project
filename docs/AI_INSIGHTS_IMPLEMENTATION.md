# AI Insights — Implementation Plan

Companion to [docs/AI_INSIGHTS.md](AI_INSIGHTS.md) (the architecture spec —
section references below, e.g. §4.4, point there). This document is the
task-level build plan: what to create, in what order, with what tests, and
what "done" means per phase. Follow it with the `ai-insights` skill loaded.

Conventions inherited from the repo: Node 20.20.2 via nvm PATH prefix; `db:*`
scripts need `.env` sourced; migrations applied manually via postgres-js
script + hash recorded in `drizzle.__drizzle_migrations` (runner is in a
non-standard state — never blind `drizzle-kit migrate`); commits per task
group so regressions bisect.

---

## Phase AI1 — Deterministic insight engine (no LLM)

Goal: insights appear on real data with zero API cost. Ships alone.

### Task table (dependency order)

| # | Task | Files | Details & acceptance |
|---|------|-------|----------------------|
| T1 | **Schema + roles migration** | `packages/db/src/schema/{insights,insight-runs,metric-snapshots,insight-feedback,insight-settings}.ts`, export from `index.ts`; `packages/db/drizzle/00XX_insights.sql` | Full DDL from spec §4.5 + `factory_isolation` RLS on all five + `insights_worker` role (SELECT domain tables via GUC policy, INSERT/UPDATE insights tables) + `insights_sql` role stub (no grants yet — AI3). Apply manually; record journal + `__drizzle_migrations`. Accept: `db:verify-rls` extended (T2) passes. |
| T2 | **verify-rls extension** | `packages/db/src/verify-rls.ts` | Positive: worker with GUC set reads only that factory. Negative: no GUC ⇒ 0 rows; factory B GUC ⇒ 0 factory-A rows; worker cannot write domain tables. Accept: ALL CHECKS PASSED includes the new cases. |
| T3 | **Engine skeleton** | `packages/api/src/insights/{types,hash,stats}.ts` | Types from spec §4.6/§4.7; canonical-JSON sha256 (sorted keys, exclude `computedAt`/`rowsScanned`, include `version`); `median/mad/madZ/trailingWindows/minSampleGuard`. Accept: unit fixtures for hash stability (key order, rounding) and stats edge cases (n=0,1,2, all-equal). |
| T4 | **ScopedDb** | `apps/web/lib/insights/db.ts` | Wrapper injecting `.eq('factory_id', id)` on every accessor; exposes only tables named in the analyzer's `reads:`; two constructors: `fromSession(supabase)` and `fromWorker(factoryId)` (postgres-js as `insights_worker`, `SET LOCAL app.factory_scope`). Accept: unit test — undeclared table access throws; injected filter present in emitted queries. |
| T5 | **Registry + first analyzers** | `packages/api/src/insights/registry.ts`, `analyzers/auction.ts`, `analyzers/suppliers.ts` | Implement packs for: `auction.settlement-aging` (A-5), `auction.minkg-shutout` (A-1), `auction.weight-shrinkage` (A-2), `auction.valuation-premium` (A-3), `auction.deduction-leakage` (A-6, reuses `computeSettlement` for expected charges), `suppliers.supply-trend` (S-1), `suppliers.penalty-pattern` (S-2), `suppliers.advance-exposure` (S-4). Each declares `reads`, `triggers`, `paramsSchema`, `llmTool`. Accept: fixture DB rows → expected packs (see fixture inventory below); every pack ≤3 KB; every money figure has `formula`. |
| T6 | **Rules** | `rules/auction.ts`, `rules/suppliers.ts` | 8 launch rules keyed to T5 packs, with `minSamples`, `cooldownDays`, severity mapping (spec §6), templated `title/detail/action` and `impact_lkr`. Accept: fixtures fire on bad data, stay silent on clean data AND on sparse data (below minSamples); impact figures hand-verified in test assertions. |
| T7 | **Runner + queue** | `apps/web/lib/insights/runner.ts` | Enqueue (debounced), SKIP LOCKED claim, execute analyzers by trigger match, evaluate rules, persist with `ON CONFLICT DO NOTHING` + supersede pass, cooldown handling, attempt/retry bookkeeping (spec §4.3). Accept: integration test on fixture factory — double-enqueue produces one run; concurrent drains don't double-claim; unchanged re-run inserts nothing. |
| T8 | **Routes** | `apps/web/app/api/insights/{run,cron}/route.ts` | `run`: POST from server actions/manual, session-authenticated, enqueues + `after(drainOnce)`. `cron`: `INSIGHTS_CRON_SECRET` header check; drains queue; (digest enqueue lands in AI2). Accept: unauthenticated cron call 401; run route rejects cross-factory scope. |
| T9 | **Event hooks** | `_actions/ingest.ts` (`confirmAcknowledgement`, `confirmValuation`, `confirmContract`), `_actions/bank.ts` (`confirmBankMatches`), `payments/actions.ts` (`generatePayments`) | One helper `queueInsightRun(trigger, scope)` called at the END of each action inside `after()`; failures swallowed+logged, never block the confirm. Accept: confirming the fixture contract creates a queued→done run and the expected insights; deliberately breaking the runner does NOT break the confirm action (test). |
| T10 | **Inbox page** | `apps/web/app/dashboard/insights/{page.tsx,actions.ts,insights-table.tsx}`, `lib/roles.ts` | Module `insights` (roles owner/manager, entitlement `insights`, group "Sales Handling" for now); list-controls table (severity/domain/entity/title/impact/age/status columns, select filters); detail pane rendering `money[].formula`, `items`, `refs` links; actions ack/dismiss/resolve with factory re-check + `status_changed_by`. Accept: typecheck; actions persist; non-owner/manager redirected. |
| T11 | **Row badges** | `components/list-controls.tsx` (optional `insightsByEntity` prop or a sibling `InsightBadge` component), `suppliers/page.tsx` + `suppliers-table.tsx`, `auction/dispatches-table.tsx` + `auction/page.tsx` | Server pages fetch open insights for listed entity ids (one query, `in()`); badge dot by max severity; popover with note + ack/dismiss. Accept: fixture supplier shows the S-1 flag; ack clears it without reload weirdness. |
| T12 | **Fixtures & test wiring** | `packages/api/src/insights/insights.test.ts`, `package.json` `test:insights` | See fixture inventory. Accept: `pnpm --dir packages/api test:insights` → ALL CHECKS PASSED; suite runs without DB (analyzers take a stub ScopedDb fed from fixture arrays). |
| T13 | **Docs & skill sync** | MILESTONES.md check-off, skill touch-ups | Reality matches docs; deviations fixed in docs, not tolerated in code. |

### Fixture inventory (T12 — deterministic, no live DB)

One fixture factory dataset (TS module) engineered so each rule has a firing
and a silent case: 2 brokers (BPML, ASIA) with rate cards; 3 dispatches (one
clean, one with 2 min-kg breaches + weight deltas, one settled late); 30 lots
across OP/BOPF/PEK with valuations + sale lines (OPA cell under-realising,
PEK cell n=3 → below minSamples, must stay silent); settlements (one unpaid
14 days past prompt, one clean, one with a doubled documentation charge);
12 suppliers × 16 weeks of weighings (one −40% trend, one flat, one with only
5 weeks history → silent), water penalties (one repeat offender), advances
(one at 2.3× earnings). Hand-computed expected `impact_lkr` values are
literal constants in the assertions.

### AI1 exit gate

`test:insights`, `turbo typecheck`, `db:verify-rls`, `db:verify-auth` all
green · badges + inbox verified in preview on seeded data · confirm-action
latency unchanged (hooks are post-response) · commit per task group.

---

## Phase AI2 — LLM notes + weekly digest

| # | Task | Files | Details & acceptance |
|---|------|-------|----------------------|
| T14 | **Config & spend ledger** | `lib/insights/config.ts` | Model ids (`claude-haiku-4-5-20251001`, `claude-sonnet-4-6`), budget read from `insight_settings`, month-spend query over `insight_runs`, degradation ladder thresholds (spec §5.6). Accept: unit tests for ladder transitions at 70%/100%. |
| T15 | **Citation validator** | `packages/api/src/insights/validate.ts` | Number-token extraction (handles `1,940,250`, `18%`, `Rs 11.5k` normalization) matched against pack values with formatting-only tolerance (spec §5.2). Accept: fixture suite — valid note passes; invented figure rejected; reformatted figure passes. Pure function, no API. |
| T16 | **Note pipeline** | `lib/insights/agent.ts` | For rule-flagged insights: build prompt (system + packs + rule context), Haiku call, validate, replace `detail/action` (source='llm') or keep template on failure; skip when `evidence_hash` already noted; record tokens/cost on the run. Accept: mocked-API tests for cache-skip, validation-fallback, budget-refusal paths. |
| T17 | **Digest pipeline** | `lib/insights/agent.ts`, cron route | Pre-rank by `impact_lkr` (runner selects, not the model), prior digest for "what changed", Sonnet call, validate all figures, store as factory-level insight `kind='weekly-digest'`, cache on input-pack hash. Accept: fixture digest cites only pack numbers; unchanged week ⇒ 0 tokens (test asserts no API call). |
| T18 | **Digest panel + note UI** | `dashboard/page.tsx`, auction dashboard, insight popover | Renders digest JSON natively; LLM-written notes show a subtle "AI" marker; budget-exhausted grey state. |
| T19 | **Live pilot** | — | Run against customer-zero data for 2 weeks; review dismiss-rate per kind; tune `minSamples`/thresholds in code defaults. Gate for AI3. |

**AI2 exit gate:** digest hallucination spot-check clean over fixtures + pilot
weeks; spend ledger visible; kill switch (`enabled=false`) verified.

## Phase AI3 — Agentic drill-down & feedback

| # | Task | Files | Details |
|---|------|-------|---------|
| T20 | **Registry-as-tools agent loop** | `lib/insights/agent.ts` | Tool defs derived from `ANALYZERS.filter(llmTool)`; hard stops (8 calls/30K tokens/60s); citations mandatory; full `tool_calls` audit. |
| T21 | **Guarded SQL tool** | migration (grants + `v_insights_*` views), `lib/insights/sql-tool.ts` | `insights_sql` role; SELECT-only on allowlisted views (no free-text columns); `statement_timeout 3s`; forced LIMIT 200; ≤16 KB results; GUC scoping; rejection tests (write, disallowed relation, oversize, cross-tenant). |
| T22 | **Ask-the-analyst UI + Analyze-now** | `dashboard/insights/ask.tsx`, entity detail buttons | Streaming answer with citation chips linking to packs/rows. |
| T23 | **Feedback loop** | inbox 👍/👎 → `insight_feedback`; monthly dismiss-rate report (itself an analyzer — the system reviews itself) | Rising dismiss-rate per kind auto-flags a threshold review. |

**AI3 exit gate:** 5 scripted owner questions answered correctly on fixtures
with citations; SQL guard test suite green.

## Phase AI4 — Forecast & applications (sequenced by data availability)

1. **Pre-dispatch packing advisor** (spec §10.1 — deterministic, can ship any
   time after AI1).
2. **What-if simulator** (spec §10.2 — reuses `computeSettlement`; needs ≥2
   broker rate cards).
3. **Broker negotiation pack** + **monthly business review** documents.
4. Seasonal intake forecast (needs 13+ months weighings), grade-price trends.
5. Post-M7/M8: out-turn and grade-mix analyzers (the 5-step recipe, spec §9).
6. Phase-2: consent-gated anonymized benchmarks (premium tier).

---

## Cross-cutting engineering notes

- **Feature flag / rollout**: module entitlement `insights` + per-factory
  `insight_settings.enabled` (default true once entitled) +
  `enabled_kinds` for gradual rule rollout. Dark-launch path: entitle only the
  dev factory first.
- **Ops visibility**: until an admin UI exists, two saved queries documented in
  the skill — failed runs last 7d; token spend by factory/month.
- **Performance**: analyzers are aggregate SELECTs over factory-scale data
  (thousands of rows) — single-digit ms; the queue keeps them off the request
  path anyway. Revisit indexes only if `insight_runs` timings say so.
- **Timezone**: all "days late"/week windows computed in Asia/Colombo.
- **Estimated effort** (focused sessions): AI1 ≈ 4–6 · AI2 ≈ 3–4 · AI3 ≈ 3–4.
  AI1 alone already delivers the flags/notes the owner asked for.

## Definition of done (whole track)

Owner sees row flags + notes on suppliers and dispatches, an inbox of
quantified insights with visible arithmetic, and a Monday digest — with the
LLM spending under ~$2/factory/month, zero cross-tenant exposure by
construction, hallucination-blocked notes, and a 5-step recipe that lets every
future ERP module plug into the same engine.
