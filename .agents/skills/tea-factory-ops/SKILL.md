---
name: tea-factory-ops
description: >-
  Onboarding + operational playbook for the Tea Factory Ops / board-leaf-project
  monorepo (Sri Lankan bought-leaf tea-factory ERP, evolving into a two-sided leaf
  marketplace). USE THIS SKILL WHENEVER you are working anywhere in
  ~/Desktop/board-leaf-project — building or changing a milestone, touching the
  Next.js web app (apps/web), the Expo app (apps/mobile), the Drizzle/Supabase
  database (packages/db), RLS policies, auth, the roles/entitlements registry, or
  the product/milestone docs. It carries the vision, the multi-tenant architecture
  rules, the domain knowledge (leaf intake → out-turn → grades → sales → accounting),
  and the toolchain gotchas (Node 20.20 via nvm, hoisted pnpm, react pin, .env
  sourcing, mint-otp, preview servers) that are painful to rediscover. Consult it
  before assuming how this repo is built — the conventions here override generic defaults.
---

# Tea Factory Ops — working in this repo

You are working on **Tea Factory Ops** (dir: `~/Desktop/board-leaf-project`, git
remote `pasindubg/tea-factory-board-leaf-project`). Read this skill before acting;
it encodes decisions already made so they don't get re-litigated or forgotten.

## What this is (one paragraph)

A B2B SaaS for Sri Lankan **bought-leaf tea factories**. **Phase 1** is the factory
ERP — the wedge — covering the whole physical-to-financial loop: green-leaf
intake/weighing, supplier payments (with quality-tier "superleaf" pricing),
production & **out-turn** tracking, sifting into **grades**, lots → deliveries →
auction/buyer **sales**, and **accounting**. **Phase 2** turns the network of
onboarded factories and their supplier books into an **Uber-like two-sided leaf
marketplace** where suppliers/estate owners and factories discover each other by
area and quality, and leaf quality becomes a price signal instead of a
relationship-ending reject at the gate. Build Phase 1 completely before Phase 2.

## Read these first (canonical sources of truth)

- **[docs/PRODUCT.md](../../../docs/PRODUCT.md)** — vision, personas & devices, the
  tea-production domain walkthrough, superleaf pricing, multi-tenancy rules, the
  modular/sellable-module architecture. **If product intent and this skill ever
  disagree, PRODUCT.md wins** (and fix the skill).
- **[MILESTONES.md](../../../MILESTONES.md)** — the live build plan with a concrete
  verification gate per milestone. **Check it for current status before building.**
- **[docs/AUCTION.md](../../../docs/AUCTION.md)** — full spec for the Auction &
  Settlement track: state machine, data model, PDF ingestion,
  contract math, the four reconciliations. **Read before building any A-track work.**

This skill is the *operational* layer (how to work here); those two are the
*what/why*. Keep all three consistent when you change scope.

## Status & what to build next

M0–M5 are **done & verified** (monorepo; Drizzle schema + RLS; email-OTP auth; web
dashboard with suppliers/collectors/weighings + charts; user management + a
restricted weighings-only web UI for the `collector` role). **M4 mobile app is
built but parked** — it becomes the Phase 2 *field* app for suppliers; collectors
turned out to be desktop users at the factory gate.

**M6 (payments + superleaf) is done & verified** — quality tiers, effective-dated
tier assignment, deductions (advances/transport/water/ad-hoc), the pure
`packages/api` calc engine (run `pnpm --dir packages/api test:payments`), and
printable per-supplier statements with "bonus missed". Real LKR values still need
calibrating with the factory.

**Auction-first pivot (June 2026).** The factory has no system for the Colombo
auction flow (broker PDFs + a bank CSV, reconciled by hand), but already runs leaf
collection/payments elsewhere — so the **Auction & Settlement track is now the
wedge and ships first**, ahead of the production/grades ERP milestones, which are
deferred. The A-track is anchored on real data: Sale **2026-023**, broker BPML,
marks MF1530 KUMUDU / MF1530A ITTAPANA (see the `ktf-auc-fll` sample docs).

**Priority order:**
M6 payments + superleaf ✅ → **A1 auction intake & cataloguing → A2 valuation &
sale → A3 VAT/deductions/settlement → A4 accounting + bank/cheque reconciliation
(Priority 2)** → then the *deferred* ERP milestones: M7 production/out-turn →
M8 sifting & grades → M9 lots/deliveries (wires into the A-track) → M10 accounting
close → M11 deploy & self-serve onboarding. Then Phase 2 = M12–M17 (supplier
identity, field app + offline, geo, listings, quality/trust, monetization). The
four A-track reconciliations: ① invoice↔acknowledgement (shutouts), ② valuation↔
sale price, ③ VAT cash-vs-guarantee + remit to govt, ④ settlement↔bank credit.
Always confirm exact status in MILESTONES.md.

The user triggers a build phase by typing the milestone code (e.g. `a1`, `m6`).
**Wait for that go-ahead** before starting a milestone's implementation.

## Repo map

```
apps/web        Next.js 15 App Router — THE ERP (the product that ships now)
apps/mobile     Expo (React Native) — parked; future Phase 2 field app
packages/db     Drizzle schema, migrations, RLS, + ops scripts (seed/verify/mint)
packages/api    tRPC — empty until M6 (payments is the first real use)
packages/ui     shared UI — empty until shared components emerge
docs/PRODUCT.md, MILESTONES.md, README.md
```

Web app internals worth knowing before editing:
- `apps/web/lib/roles.ts` — **the access registry** (see Architecture below).
- `apps/web/lib/profile.ts` — `requireProfile(allowed?)` gate + `collectorForUser`.
- `apps/web/lib/supabase/{server,client,admin}.ts` — session server client,
  browser client, and the **admin** client (secret key; server-only).
- `apps/web/app/dashboard/<module>/{page,actions}.tsx` — one folder per module.
- `packages/db/src/schema/*.ts` — one file per table, re-exported from `index.ts`.

## Environment & toolchain — READ BEFORE RUNNING ANYTHING

These are the traps that cost hours. The repo runs on **Node 20**, but Expo (SDK 56)
needs **≥ 20.19.4**, and the machine's default is older.

- **Node:** use **20.20.2 via nvm**. nvm cannot flip the default symlink here
  because `~/.npmrc` has a `prefix` (for `~/.npm-global`, where pnpm lives). So for
  any `expo`/`node`/`pnpm` command, **prepend PATH**:
  ```bash
  export PATH="/Users/pasindu/.nvm/versions/node/v20.20.2/bin:/Users/pasindu/.npm-global/bin:$PATH"
  ```
  `pnpm` is the global at `/Users/pasindu/.npm-global/bin/pnpm` (v9).
- **pnpm uses `node-linker=hoisted`** (root `.npmrc`) — required so Metro/Expo can
  resolve modules. Keep it; don't switch to the default isolated linker.
- **`react` and `react-dom` are pinned to the same exact version (19.2.3)** via
  `pnpm.overrides` in the root `package.json`. They MUST match or Expo web throws
  "Incompatible React versions". If you bump one, bump both.
- **Supabase Node scripts need `NODE_OPTIONS=--experimental-websocket`** on Node 20
  (already baked into the relevant `db:*` scripts).
- **`db:*` scripts do NOT auto-load `.env`.** Source it first:
  ```bash
  cd ~/Desktop/board-leaf-project && set -a; . ./.env; set +a
  ```
- **`DATABASE_URL` uses the Supabase session pooler** (`aws-1-ap-south-1.pooler...`),
  not the direct `db.*.supabase.co` host (that's IPv6-only and unreachable here).
  Project ref `mjptydjrsezqvbrlwooz`, Mumbai region. The password contains `@`,
  URL-encoded as `%40`.
- **`.env` is gitignored — never commit it.** Secret key is server-only;
  `NEXT_PUBLIC_`/`EXPO_PUBLIC_` prefixes are the browser-exposure boundary.

## Architecture rules (do not violate)

**Multi-tenancy = one Postgres, isolated by `factory_id`, enforced by RLS.**
- Every domain table carries `factory_id` (indexed) and gets an RLS policy **in the
  same migration that creates it**. The standard policy is `factory_isolation`,
  `FOR ALL TO authenticated`, `USING (factory_id = public.current_factory_id())`
  **with a matching `WITH CHECK`** so rows can't be written into another tenant.
- `current_factory_id()` is a `SECURITY DEFINER` SQL function (definer needed to
  avoid recursion on the `users` policy). Don't add `SECURITY DEFINER` elsewhere to
  paper over a permission error.
- Tenant data reads/writes go through the **session** client (RLS stays enforced).
  The **admin** client (secret key, bypasses RLS) is ONLY for auth-side work:
  create login, ban/unban, delete login. Never use it to read/write tenant tables.

**Access = role ∩ entitlement, registered once in `apps/web/lib/roles.ts`.**
- `MODULES` is the single source of truth: each entry has `roles` (who sees it) and
  an `entitlement` key (which sellable bundle the factory must own). Nav, pages, and
  server actions all gate on this. **Never inline role checks in pages** — add/adjust
  the registry instead.
- Roles: `owner` (everything incl. user management), `manager` (everything except
  users), `collector` (weighings entry + their own records only). Pages call
  `requireProfile(allowedRoles)`; it also redirects deactivated/orphaned users.
- Entitlement enforcement code lands in M11, but **every module must declare its
  entitlement key from day one** so flipping enforcement on is trivial.

**Data conventions:**
- `numeric` for ALL money and weight columns — never `real`.
- **Client-generated UUIDs** for anything that can be created offline/on mobile
  (weighings already do this; it's the idempotency key for future offline sync).
- After any schema/policy change, the RLS and auth gates must still pass (below).

## Domain cheat-sheet

Production pipeline (what each ERP stage records — full detail in PRODUCT.md):
`green-leaf intake (weighing)` → withering → **rolling** → fermentation →
**big-burner drying → made tea (dried bulk, weighed)** → **sifting into grades** →
**lots → dispatch → auction/buyer sale** → payments & accounting.

- **Out-turn % = made-tea kg ÷ green-leaf kg** (typically ~20–24%, baseline is
  per-factory). Low out-turn vs baseline ⇒ watered/coarse leaf. Drying batches mix
  many suppliers, so per-supplier attribution is **statistical**, not per-bag — an
  explicit design problem in M7, not a measurement.
- **Grades:** Pekoe, Pekoe 1, BOP, BOPF, Dust 1, … (configurable per factory). A
  higher share of primary grades ⇒ better leaf — the second supplier-quality signal.
- **Superleaf (quality-tier pricing, M6):** the factory pays more for good leaf and
  less for poor. **Always model it as bonuses on a base rate, never deductions**
  (loss aversion makes a "cut" drive suppliers to competitors; the same money framed
  as a bonus retains them). Base/tier-names/bonus amounts are **owner-editable,
  effective-dated** settings — never hardcoded. Statements show bonus earned AND
  bonus missed. Tiers move on a rolling window with warnings, backed by M7/M8
  evidence.
- These quality signals are also Phase 2 groundwork (the marketplace supplier score).

## Adding a module (the standard recipe)

1. **Schema:** `packages/db/src/schema/<module>.ts`, export from `index.ts`. Include
   `factory_id` + index. Generate a migration AND add the RLS policy in it.
2. **Routes:** `apps/web/app/dashboard/<module>/` with `page.tsx` + `actions.ts`
   (forms colocated). Every server action starts with `requireProfile([...roles])`.
3. **Register** the module in `apps/web/lib/roles.ts` `MODULES` with its `roles` and
   `entitlement` key.
4. **Gate** in MILESTONES.md with a concrete verification step; keep `db:verify-rls`
   passing.

## Verification & common commands

Run from repo root with the PATH export and (for db scripts) `.env` sourced.

```bash
pnpm turbo typecheck                      # type-check all packages
pnpm --dir packages/db db:verify-rls      # RLS factory-isolation gate (must pass)
pnpm --dir packages/db db:verify-auth     # auth + role gate (must pass)
pnpm --dir packages/db db:seed            # reseed dev data (destructive)
pnpm --dir packages/db db:mint-otp <email># print a login OTP (SMTP is unconfigured)
```

- **`db:mint-otp`** is the way to log in during testing — Supabase SMTP isn't set up,
  so the login form's "I already have a code" button + a minted code is the path.
  It refuses to mint for an email that has no auth user (won't resurrect removed ones).
- **Browser verification:** prefer the `preview_*` tools over manual checks.
  `.Codex/launch.json` defines two servers: **`web`** (Next.js, port 3000) and
  **`mobile-web`** (Expo web, port 8081). When driving RN-web (mobile) elements,
  remember Pressables render as `div`s — click by text via `preview_eval` if needed.
- **`verify-rls` resolves owner ids by email** (seed user ids go stale after
  `db:link-auth` re-points them to real Supabase auth ids — factory ids stay fixed).
- **Hosting:** Supabase does NOT host web apps — it's the backend (Postgres, Auth,
  Storage). The web app deploys to **Vercel** (planned M11); the mobile app ships via
  Expo/EAS. Don't try to serve Next.js from Supabase Edge Functions.

## Working agreement

- **Commit/PR only when the user asks.** Branch per change (e.g. `feat/m6-payments`);
  the user reviews via PR. `gh` CLI isn't installed — use the GitHub API with stored
  git credentials, or ask the user.
- **Verify before claiming done:** type-check + the relevant `db:verify-*` gate +,
  for UI, a `preview_*` walk-through. Clean up any test rows you create in the real
  Supabase DB.
- **Keep the docs in lockstep.** A scope/ordering change means editing MILESTONES.md
  and PRODUCT.md (and this skill) in the same breath, plus the project memory file.
- Known open items: confirm the real **payment formula** with the factory before M6;
  dashboard timestamps currently render in UTC, not Asia/Colombo (tracked separately).
