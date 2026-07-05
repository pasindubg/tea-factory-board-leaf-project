# AI Insights & Business Analytics — Architecture & Functional Spec

Status: **DESIGN — approved for implementation planning, nothing built yet.**
Owner track: **AI-track (AI1–AI4)**, runs alongside the A-track.
Companion skill: `.claude/skills/ai-insights/SKILL.md` (implementation playbook).

---

## 1. Vision & non-negotiable principles

Give the factory owner and manager **quantified, money-denominated, actionable
insights** computed from the data the ERP already captures — not generic advice.
Every insight must answer three questions or it doesn't ship:

1. **What happened?** (a fact, with numbers, linked to the exact rows)
2. **What does it cost / earn?** (an LKR impact estimate with the formula shown)
3. **What should I do?** (one concrete action inside or outside the app)

### Principles (in priority order)

- **P1 — Analytics first, LLM last.** Every insight starts as a deterministic
  SQL/TypeScript computation over the tenant's tables ("analyzer"). Most
  insights ship as pure rule output with **zero LLM tokens**. The LLM is a
  *narrator and cross-domain synthesizer* that only ever sees curated,
  pre-aggregated **evidence packs** (1–3 KB JSON), never raw table dumps.
- **P2 — Money-denominated.** Impact in LKR with the arithmetic visible
  (`impact_lkr` + `evidence.formula`). "Shutout rate high" is banned; "3
  shutouts on BOPF this month left 920 kg at the warehouse ≈ Rs 331,200 delayed
  by a sale cycle; at 18% p.a. that's ≈ Rs 3,300 of working-capital cost plus
  re-print sample loss" is the standard.
- **P3 — Registry-extensible.** Analyzers, rules, and LLM tools are registered
  in code registries (same pattern as `MODULES` in `lib/roles.ts`). Adding a
  future ERP module (M7 out-turn, M8 grades…) = registering its analyzers; the
  insight engine and the LLM agent pick them up with no core changes.
- **P4 — Tenant-safe.** Everything runs through RLS-scoped clients per factory.
  One factory's evidence never appears in another factory's prompt. The LLM's
  SQL escape hatch (AI3) is read-only, table-allowlisted, row/time-capped.
- **P5 — Budgeted & cached.** Hard per-factory token budgets. Evidence packs
  are content-hashed; unchanged evidence is never re-summarized. Cheap model
  (Haiku) for per-entity notes, stronger model (Sonnet) for the weekly digest
  and agentic drill-downs.
- **P6 — Human-in-the-loop.** Insights are suggestions with an ack/dismiss
  lifecycle and a usefulness feedback signal. The system never mutates business
  data on its own.
- **P7 — No premature abstraction.** AI1 ships rules-only. The agentic layer
  (AI3) is built only after AI1/AI2 prove which analyzers earn their keep.

---

## 2. Data inventory → signal catalog

Everything below maps to **existing tables**. This is the complete list of
signals worth computing today, grouped by domain, each with its impact math.
(Tables: `weighings, suppliers, collectors, payments, payment_lines,
supplier_adjustments, supplier_tiers, quality_tiers, price_rates,
auction_sales, auction_lots, lot_invoices, valuations, sale_lines, settlements,
settlement_charges, vat_ledger, bank_txns, brokers, buyers, marks,
broker_rates, auction_grades, broker_grade_thresholds, doc_imports,
auction_audit, supplier_requests, supplier_messages`.)

### 2.1 Auction / dispatch domain (the wedge — highest value)

| # | Signal | Source tables | Computation | Insight & impact math | Example flag |
|---|--------|--------------|-------------|----------------------|--------------|
| A-1 | **Shutout & min-kg risk** | `auction_lots`, `broker_grade_thresholds` | per dispatch: lots with `state='shutout'`, lots where `net_wt < threshold` at entry; trailing 90-day shutout rate per grade/broker | shutout kg × last avg price/kg for grade = delayed revenue; + working-capital cost (`× rate_pa × cycle_days/365`); + re-print sample loss kg × price. **Factory-image flag** when a dispatch has ≥N threshold breaches — brokers notice repeat offenders | `flag: dispatch 003 — 2 lots below BPML BOPF 220kg rule; pack to threshold before dispatch` |
| A-2 | **Weight shrinkage** | `auction_lots` (invoiced vs ack net via recon ①), `auction_audit` weight_delta | rolling sum of negative `weightDelta` per broker/store | Σ(kg lost) × avg price/kg. Systematic loss at one broker's store = claim/negotiate | `Rs 41,000 of weight differences at BPML store over 6 sales — raise with broker` |
| A-3 | **Valuation vs realised premium** (recon ②) | `valuations`, `sale_lines` | premium % per grade, per broker, per buyer, per sale; trend over trailing 5 sales | (realised − projected) per grade → which grades systematically under/over-perform; informs production mix (feeds M8) and broker choice | `OPA realising −7% vs valuation for 3 straight sales via BPML; OP +4%` |
| A-4 | **Broker comparison** | `sale_lines`, `settlements`, `bank_txns`, `settlement_charges` | same-grade avg price/kg, deduction ratio (total_deductions/proceeds), prompt-to-credit days — per broker | (price_diff × annual kg) potential gain from reallocating dispatches; only fires once ≥2 brokers have history | `Asia Siyaka nets Rs 12/kg more on PEK after deductions` |
| A-5 | **Settlement aging** (recon ④) | `settlements`, `bank_txns`, `auction_sales.prompt_date` | unpaid/under-paid settlements past prompt+grace; per-broker median payment delay | outstanding LKR × days late × rate_pa/365 = financing cost; aging buckets | `Rs 1.94M overdue 12 days past prompt — chase broker; costs ≈ Rs 11.5k/mo` |
| A-6 | **Deduction leakage** | `settlement_charges` vs `broker_rates` | recompute expected charges from the rate card; diff per charge code | Σ overcharge LKR; catches silent rate creep and double-charged lines | `documentation charged twice on contract 2026-023/BPML/4411` |
| A-7 | **Guarantee-VAT exposure** (recon ③) | `vat_ledger`, `sale_lines`, `bank_txns` | guarantee-mode VAT not yet received vs remittance calendar | LKR at risk of being remitted to IRD before receipt = cash-flow gap | `Rs 80,640 guarantee VAT pending; remittance due in 9 days` |
| A-8 | **Cycle-time drag** | `auction_sales` status timestamps, `doc_imports.confirmed_at` | days invoiced→acknowledged→valued→sold→settled per dispatch, vs factory median | each extra cycle day × avg dispatch value × rate_pa/365; flags stuck dispatches | `dispatch 002 stuck at 'valued' 18 days (median 6)` |
| A-9 | **Buyer intelligence** | `sale_lines`, `buyers` | buyer share of proceeds, per-buyer premium vs valuation, guarantee-usage rate | concentration risk (top buyer > 40% proceeds); which buyers consistently pay above valuation for which grades | `Akbar = 52% of proceeds — concentration risk` |
| A-10 | **Re-print economics** | `auction_lots.reprint_source_lot_id`, `valuations`, `sale_lines` | original valuation vs eventual realised price + sample kg lost, per re-printed lot | true cost of a re-print cycle (price decay + sample loss + delay) → justifies fixing root causes in A-1 | `re-prints realise −9% on average — each avoided shutout saves ≈ Rs 8,400` |

### 2.2 Leaf / supplier domain (M6 data)

| # | Signal | Source tables | Computation | Insight & impact math | Example flag |
|---|--------|--------------|-------------|----------------------|--------------|
| S-1 | **Supply trend / churn risk** | `weighings` | per-supplier weekly kg, 4-week vs prior-12-week slope | declining supplier ≈ leaf moving to a competitor: lost kg × marginal profit/kg per month. **Relationship flag** with suggested outreach | `W.A. Perera down 38% over 4 weeks — visit/call; ≈ Rs 26k/mo margin at stake` |
| S-2 | **Quality penalty pattern** | `supplier_adjustments` (`water_penalty`), `weighings.notes` | penalty frequency & % of leaf value, trailing 3 months per supplier | repeated penalties = systematic watering/coarse leaf; flag for tier review; savings = penalty base × improvement | `3rd water penalty in 8 weeks for supplier X — tier review + field visit` |
| S-3 | **Bonus-missed nudge** (superleaf) | `payments.bonus_missed`, `supplier_tiers` | suppliers with high bonus_missed who are close to the next tier | per PRODUCT.md loss-aversion framing: telling a supplier what they *missed* drives quality up; projected extra bonus vs extra leaf value retained | `5 suppliers missed Rs 4,200 avg bonus — statements + a word from the collector` |
| S-4 | **Advance overexposure** | `supplier_adjustments` (`advance`), `payments` | outstanding advances vs trailing 3-month average earnings per supplier | default risk when advances > k× monthly net; flag before topping up | `advance = 2.3× monthly earnings for supplier Y — pause further advances` |
| S-5 | **Collector performance** | `weighings`, `collectors`, `suppliers` | kg/day trend, active-supplier retention, penalty rate of their book, per collector | collector-level supply decay predicts area-level churn; route/incentive action | `collector Nimal's book down 22%; 4 of his suppliers went quiet` |
| S-6 | **Supply concentration & seasonality** | `weighings`, `suppliers.area` | area/supplier concentration, month-over-month seasonal baseline | factory intake forecast for the month vs same month last year; capacity & cash planning | `intake pacing 12% under seasonal baseline — expect ~9,800 kg less` |
| S-7 | **Payment hygiene** | `payments.status` | pending statements aging after generation | unpaid statements strain supplier trust (the churn driver in S-1) | `11 statements pending > 14 days` |

### 2.3 Cross-domain (the LLM earns its keep here)

| # | Signal | Sources | What the synthesis adds |
|---|--------|---------|--------------------------|
| X-1 | **Weekly owner digest** | all analyzer outputs | one narrative: top 3 money items, what changed vs last week, one theme (e.g., "quality issues at intake are surfacing as auction discounts") |
| X-2 | **Leaf→auction quality thread** | S-2 + A-3 (later M7/M8 out-turn & grade data) | correlate intake penalties/areas with grades that under-realise at auction; becomes much stronger post-M8 |
| X-3 | **Cash-flow week ahead** | A-5, A-7, S-7, `payments` | expected credits (settlements due) vs outgoings (supplier payments, VAT remittance) — a simple 4-week cash runway note |
| X-4 | **Factory-image score** | A-1, A-2, A-8, recon audit | per-broker "how we look to the broker" composite (shutout rate, weight disputes, doc turnaround); trend + one improvement lever |

---

## 3. Architecture

### 3.1 Three-layer funnel (token frugality by construction)

```
                 ┌────────────────────────────────────────────────┐
   Postgres ───▶ │ L1 ANALYZERS (pure SQL/TS, per-domain,         │──▶ metric_snapshots
   (RLS-scoped)  │ registered; output: compact evidence JSON)     │      (time series)
                 └───────────────┬────────────────────────────────┘
                                 ▼
                 ┌────────────────────────────────────────────────┐
                 │ L2 RULES (deterministic thresholds over        │──▶ insights rows
                 │ evidence; quantified impact; NO LLM)           │    (flag + note, source='rule')
                 └───────────────┬────────────────────────────────┘
                                 ▼ (only entities that tripped rules, + digest cadence)
                 ┌────────────────────────────────────────────────┐
                 │ L3 LLM SYNTHESIS (Claude tool-use agent over   │──▶ insights rows
                 │ registered analyzer tools; evidence packs only;│    (source='llm', ai note)
                 │ budgeted, cached by evidence hash)             │    weekly digest
                 └────────────────────────────────────────────────┘
```

- **L1 Analyzer** = `(factoryId, scope) → EvidencePack` where scope is
  `{ entityType, entityId? , period? }`. Pure function of the DB; versioned
  (`analyzerKey@v`); output small (≤ ~3 KB), numbers-only, with a `formula`
  string for every derived LKR figure.
- **L2 Rule** = `(EvidencePack) → InsightDraft | null`. Pure TS predicate +
  impact formula + action template. Thresholds live in a per-factory settings
  row (owner-tunable later; code defaults first).
- **L3 Agent** = a server-side job calling the Claude API with **tool use**,
  where the tools are exactly the registered analyzers (plus, in AI3, one
  guarded read-only SQL tool). It drafts `ai_note` text for flagged entities
  and composes the weekly digest. It cannot write to any table except
  `insights`/`insight_runs` via the job wrapper.

### 3.2 New tables (all with `factory_id` + `factory_isolation` RLS in the same migration)

```
insights
  id uuid pk, factory_id fk, entity_type text        -- 'supplier'|'dispatch'|'broker'|'buyer'|'collector'|'factory'|...
  entity_id uuid null,                               -- null = factory-level
  kind text,                                         -- catalog key, e.g. 'settlement-overdue', 'supply-drop'
  severity text check in ('info','suggestion','warning','critical')
  status text check in ('new','acknowledged','dismissed','resolved') default 'new'
  title text, detail text,                           -- detail = the "AI note" (rule-templated or LLM-written)
  impact_lkr numeric(14,2) null,
  evidence jsonb,                                    -- the pack that justified it (incl. formula strings)
  source text check in ('rule','llm'), rule_key text null,
  run_id uuid fk → insight_runs, evidence_hash text, -- cache key
  created_at, superseded_by uuid null, expires_at timestamptz null
  index (factory_id, entity_type, entity_id, status)
  unique (factory_id, kind, entity_id, evidence_hash)   -- idempotent re-runs

insight_runs
  id, factory_id, trigger text ('event','cron','manual'),
  scope jsonb, analyzer_versions jsonb, tool_calls jsonb,   -- full audit of L3 tool use
  model text null, input_tokens int, output_tokens int, cost_usd numeric,
  started_at, finished_at, status, error text null

metric_snapshots                                     -- cheap trend queries + compact LLM history
  id, factory_id, metric_key text, entity_type, entity_id null,
  period_start date, period_end date, value jsonb
  unique (factory_id, metric_key, entity_type, entity_id, period_start)

insight_feedback
  id, factory_id, insight_id fk, user_id fk, useful boolean, note text, created_at
```

**Deliberate choice — no `ai_notes` column on `suppliers`/`auction_sales`.**
The requested "AI note + flag per row" is served by joining the `insights`
table (`entity_type/entity_id`, `status='new'`, max severity → badge; latest
`detail` → note). Polymorphic storage means every current *and future* list
gets flags for free, with lifecycle (ack/dismiss), history, and RLS in one
place — a per-table column would need a migration per module forever.

### 3.3 Registries (the extensibility contract)

`packages/api/src/insights/registry.ts` (pure, fixture-testable, same repo
conventions as the existing engines):

```ts
export type AnalyzerDef = {
  key: string;                    // 'auction.settlement-aging'
  version: number;
  entityTypes: EntityType[];      // what scopes it can run for
  triggers: TriggerKey[];         // 'contract-confirmed', 'bank-confirmed', 'weekly', ...
  paramsSchema: JSONSchema;       // doubles as the LLM tool schema (P3)
  run(db: ScopedDb, scope: Scope, params?: unknown): Promise<EvidencePack>;
};

export type RuleDef = {
  key: string;                    // 'settlement-overdue'
  analyzer: string;               // which pack it consumes
  severity: Severity;
  evaluate(pack: EvidencePack, cfg: FactoryInsightConfig): InsightDraft | null;
};

export const ANALYZERS: AnalyzerDef[] = [ ... ];
export const RULES: RuleDef[] = [ ... ];
```

**One definition, three consumers:** the scheduler runs analyzers by trigger;
the rule engine consumes packs; the L3 agent gets *the same registry* exposed
as Claude tools (`paramsSchema` is the tool schema). Registering an analyzer
for a new module instantly (a) computes metrics, (b) enables rules, (c) arms
the agent — that is the "dynamically usable analytical tools" requirement,
made safe: the LLM has full agility **over the registry**, and in AI3 gains a
guarded generic SQL tool for anything the registry doesn't cover yet.

### 3.4 Execution model (where code runs)

- **Engine code** lives in `packages/api/src/insights/` (pure; unit-tested with
  fixtures like the auction engines). DB access via an injected scoped client.
- **Job runner**: Next.js route handlers under `apps/web/app/api/insights/`
  (cron + on-demand) calling the engine. Supabase `pg_cron` (or Vercel cron
  post-M11) hits the cron route with a shared secret. Anthropic API key is
  server-only env (`ANTHROPIC_API_KEY`, never `NEXT_PUBLIC_`).
- **Triggers**:
  - *Event*: at the end of existing confirm actions (`confirmAcknowledgement`,
    `confirmValuation`, `confirmContract`, `confirmBankMatches`,
    `generatePayments`) enqueue `runInsights(trigger, scope)` — fire-and-forget
    (`after()` / `waitUntil`), never blocking the user's action.
  - *Cron*: weekly digest (Mon 06:00 Asia/Colombo), monthly supplier review.
  - *Manual*: "Analyze now" button per entity; also the AI3 "Ask the analyst".
- **Idempotency**: `unique(factory_id, kind, entity_id, evidence_hash)` — a
  re-run with unchanged data is a no-op; changed data supersedes the old row
  (`superseded_by`).

### 3.5 L3 agent design (models, budget, caching, guardrails)

- **Models**: `claude-haiku-4-5-20251001` for per-entity notes (≤1.5 KB in,
  ~150 tokens out). `claude-sonnet-4-6` for the weekly digest + AI3 agentic
  drill-downs (tool use, ≤8 tool calls, ≤~30K tokens per run). Model ids live
  in one config module.
- **System prompt** carries the domain cheat-sheet (tea auction lifecycle,
  superleaf bonus framing, the P2 "money-denominated" contract) — static,
  therefore prompt-cacheable.
- **Budget**: per-factory monthly token ceiling in config; `insight_runs`
  records usage; runner refuses L3 work past the cap (L1/L2 keep running —
  the system degrades to rules-only, never goes dark).
- **Cache**: skip L3 for any entity whose `evidence_hash` already has a
  non-superseded insight. Weekly digest caches on the hash of its input packs.
- **Guardrails**: L3 never receives raw rows — the runner passes packs only;
  tool responses are packs; AI3's `run_readonly_sql` tool runs on a dedicated
  Postgres role with `SELECT`-only on an allowlisted view set, `statement_timeout`,
  `LIMIT` injection, and byte cap, with every statement logged to
  `insight_runs.tool_calls`. Prompt-injection surface: `weighings.notes`,
  `tasting_note` etc. are data — the system prompt instructs the model to treat
  all pack strings as untrusted data, and packs quote them into a `quotes`
  field rather than inline prose.

### 3.6 UI surfaces

1. **Row flags + AI note (the user's example, generalized).** The existing
   `list-controls` tables gain an optional `insightsByEntity` prop: a severity
   badge chip on flagged rows, tooltip/expand shows the note + "why" (evidence
   numbers) + ack/dismiss. Suppliers and Dispatches Overview ship first.
2. **Insights inbox** — `/dashboard/insights`: filter by domain/severity/status
   (via the same list-controls), each card shows title, impact LKR, evidence,
   action, ack/dismiss/useful buttons. Registered in `lib/roles.ts` as module
   `insights`, roles `owner|manager`, **entitlement `insights`** (a sellable
   premium module — fits the PRODUCT.md monetization model).
3. **Weekly digest panel** on `/dashboard` and auction dashboard: the X-1
   narrative + top items. (Email/SMS later, M17 notifications.)
4. **Feedback loop**: 👍/👎 per insight → `insight_feedback` → monthly review of
   rule precision (dismiss-rate per `kind` drives threshold tuning; later,
   feedback lines are added to the digest prompt).

### 3.7 Security & tenancy checklist

- All new tables: `factory_id` + `factory_isolation` RLS **in the creating
  migration**; `db:verify-rls` extended to cover them.
- Analyzers run on the caller's RLS-scoped session (event/manual triggers) or a
  per-factory scoped service context (cron) — never the admin client.
- Insights UI gated by `requireModuleAccess("insights")`; actions likewise.
- LLM spend and every tool invocation audited in `insight_runs`.
- No PII beyond what the ERP already stores; packs use ids + names only.

---

## 4. Rollout plan (each phase independently shippable & verifiable)

### AI1 — Deterministic insight engine (no LLM) ✅ first
Schema (§3.2) + registry + trigger wiring + **8 launch rules**:
`settlement-overdue (A-5)`, `minkg-shutout-risk (A-1)`, `weight-shrinkage (A-2)`,
`valuation-premium-by-grade (A-3)`, `deduction-leakage (A-6)`,
`supply-drop (S-1)`, `water-penalty-repeat (S-2)`, `advance-overexposure (S-4)`.
Plus: insights inbox page, row badges on Suppliers + Dispatches Overview.
**Verify:** seed a fixture factory; each rule fires on its fixture and is
silent on clean data; impact formulas match hand-computed values; badges
render; ack/dismiss persists; `db:verify-rls` green.

### AI2 — LLM notes + weekly digest
Anthropic client, config/budget module, Haiku per-entity notes for flagged
entities, Sonnet weekly digest (X-1, X-3), caching + budget enforcement,
digest panel. **Verify:** digest over fixture data references only real
numbers from packs (no hallucinated figures — spot-check against evidence);
re-run with unchanged data = 0 tokens; budget cap halts L3 but not L1/L2.

### AI3 — Agentic drill-down + feedback
Registry-as-tools agent loop; guarded `run_readonly_sql`; "Analyze now" and
"Ask the analyst" (owner types a question, agent answers with tool calls +
citations to evidence); `insight_feedback` + dismiss-rate report.
**Verify:** agent answers 5 scripted owner questions correctly on fixtures;
SQL tool refuses writes/other-tenant/oversized queries in tests.

### AI4 — Forecast & benchmarks (post-M7/M8 data, Phase-2 synergy)
Grade-price trend forecasts, intake seasonal forecast (S-6 upgraded), X-2
quality thread with out-turn data, and (Phase 2, consent-gated) anonymized
cross-factory benchmarks — a natural premium-tier feature.

**Explicit non-goals (all phases):** auto-mutating business data; auto-sending
messages to suppliers/brokers; opaque scores without evidence; dumping tables
into prompts; per-table `ai_note` columns.

---

## 5. Adding a module later (the 5-step recipe)

1. Write analyzer(s) in `packages/api/src/insights/analyzers/<module>.ts`
   returning packs (with `formula` strings) + fixture tests.
2. Register in `ANALYZERS` with `triggers` + `paramsSchema`.
3. Add rules to `RULES` with severity + impact math + action template.
4. If a new entity type needs row badges, pass `insightsByEntity` into its
   list table (one prop).
5. Nothing else: inbox, digest, agent tools, budgets, RLS pattern all inherit.

## 6. Open decisions (deliberately deferred)

- Queue: fire-and-forget `after()` is enough until M11 deploy; revisit
  (pg-boss / Supabase queues) if event volume grows.
- Threshold tuning UI (owner-editable rule config) — after AI1 proves defaults.
- Digest delivery channel (in-app now; email/SMS with M17 notifications).
- Sinhala-language notes for field-facing suggestions (S-3 statements) — ask
  customer zero.
