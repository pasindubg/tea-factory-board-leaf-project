# Tea Factory Ops 🍃

**Digitizing Sri Lanka's green-leaf supply chain — starting with the factory, ending with a marketplace.**

## The problem

Sri Lanka's bought-leaf tea factories buy green leaf from thousands of smallholder
farmers, and almost all of it runs on paper:

- Leaf collectors hand-write every weighing in a book at the farm gate
- Monthly supplier payments are calculated by hand from those books
- Lot and grade tracking is pen-and-paper
- Leaf **quality** is a constant struggle: when a factory rejects a poor delivery,
  it often loses that supplier to a competing factory — so factories accept bad
  leaf to keep relationships, and quality stays invisible and unpriced

## The vision

**Phase 1 — Factory ERP (in progress).** A SaaS for bought-leaf factories: a web
app for the whole factory — owners and managers get daily intake, supplier
management, automatic monthly payment calculation, and production tracking
(out-turn % and grades, which expose watered/poor leaf per supplier); the
weighing desk at the factory gate gets a restricted weighing-entry interface.
Sold per-factory at LKR 5,000–15,000/month. A mobile *field* app for estate
owners and suppliers comes with Phase 2. Full domain and persona detail:
**[docs/PRODUCT.md](docs/PRODUCT.md)**.

**Phase 2 — Leaf Marketplace.** The bigger play: an Uber-like two-sided platform
where leaf suppliers / estate owners and factories / buyers both have accounts.
Suppliers list available leaf; factories discover suppliers by area (maps) and
quality; quality becomes a **score and a price signal** instead of a
relationship-ending rejection at the gate. Supplier grades from acceptance rates,
premium intelligence tiers, and (eventually) image-based leaf quality detection.

Every factory onboarded in Phase 1 brings its supplier book with it — seeding the
network Phase 2 needs. The full plan with verification gates per milestone lives
in **[MILESTONES.md](MILESTONES.md)**.

## Status

| Milestone | Description | Status |
|-----------|-------------|--------|
| M0 | Monorepo scaffold | ✅ done |
| M1 | Database, multi-tenant RLS | ✅ done |
| M2 | Auth (email OTP) + app shells | ✅ done |
| M3 | Web dashboard: suppliers, collectors, weighings, charts | ✅ done |
| M4 | Mobile app (built; parked → Phase 2 field app) | ✅ done |
| M5 | User management + restricted collector web UI | ✅ done |
| M6 | Payments + superleaf quality-tier pricing | ✅ done |
| M7 | Production & out-turn tracking | 🔜 next |
| M8 | Sifting & grades | planned |
| M9 | Lots, deliveries & auction/buyer sales | planned |
| M10 | Accounting (P&L) | planned |
| M11 | Hardening, deploy & self-serve onboarding | planned |
| M12–M17 | Phase 2: marketplace + field app with offline sync | planned |

## Tech stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm workspaces |
| Web dashboard | Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Recharts |
| Mobile app | Expo (React Native), TypeScript |
| Backend | Supabase — Postgres, Auth (email OTP), Row Level Security for multi-tenancy |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| API | `supabase-js` for CRUD; tRPC reserved for payment calculation & sync |

```
apps/
  web/        Next.js factory dashboard
  mobile/     Expo collector app (M4)
packages/
  db/         Drizzle schema, migrations, seed & verification scripts
  api/        tRPC routers (M5/M6)
  ui/         Shared types & Zod schemas
```

## Getting started (contributors)

### Prerequisites

- **Node.js 20+** (Node 20 needs `NODE_OPTIONS=--experimental-websocket` for some
  scripts; already baked into the package scripts)
- **pnpm 9** — `npm install -g pnpm@9`
- **Docker Desktop** — runs the local Supabase stack (Option B below)

### 1. Clone and install

```bash
git clone <repo-url> && cd board-leaf-project
pnpm install
```

### 2. Set up the database

**Day-to-day development uses Option B (local, isolated).** The hosted
Supabase project is the live customer database — local dev must never point
at it, and a single gate (`apps/web/lib/env.ts`) enforces that at runtime. See
[docs/ENVIRONMENT_CHANGES.md](docs/ENVIRONMENT_CHANGES.md) for why.

**Option A — hosted Supabase (only for the release pipeline / one-off prod
debugging, not local dev):**

```bash
cp .env.example .env
# Fill in from your Supabase dashboard:
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (Project Settings → API)
#   SUPABASE_SECRET_KEY                                             (Project Settings → API Keys)
#   DATABASE_URL — use the SESSION POOLER connection string         (Connect button)
```

**Option B — local Supabase CLI stack (recommended):** runs Postgres + Auth
(GoTrue) + Storage locally in Docker — a full separate project, so RLS
(`auth.uid()`), OTP login, and the admin user APIs all behave exactly like
production without touching it.

```bash
pnpm supabase start          # first run pulls Docker images, can take a few minutes
pnpm supabase status -o env  # prints the local API URL + anon/service_role keys
cp .env.local.example .env   # already has the fixed local stack values
```

Optionally clone real data (schema + `public` + `auth`) from the hosted
project into the local stack — a deliberate, manual step, never automatic:

```bash
set -a; . ./.env.hosted; set +a   # a SEPARATE .env pointed at the hosted DATABASE_URL
packages/db/scripts/clone-remote-to-local.sh
```

Then migrate and seed (from `packages/db/`):

```bash
pnpm db:migrate      # apply Drizzle migrations (schema + RLS policies)
pnpm db:seed         # 2 demo factories with suppliers and weighings
pnpm db:verify-rls   # prove tenant isolation holds (6 checks)
pnpm db:link-auth    # create real auth users for the seed emails
pnpm db:verify-auth  # end-to-end auth + RLS gate
```

`db:link-auth`/`db:verify-auth` work against the local stack too now (Option
B has a real `auth` schema), not just hosted Supabase.

### 3. Run the web app

```bash
ln -s ../../.env apps/web/.env.local   # share root env with Next.js
pnpm --dir apps/web dev                # http://localhost:3000
```

Server-rendered times and "today" boundaries use the process timezone: the web
app's `dev`/`build`/`start` scripts set `TZ=Asia/Colombo`. When deploying (e.g.
to Vercel), set a `TZ=Asia/Colombo` environment variable on the project so
production matches.

Sign in with a seeded owner account (cloud setup): `owner-a@example.com` — mint a
login code with the admin API or configure SMTP for real emails (see
`packages/db/src/verify-auth.ts` for how OTP codes are minted programmatically).

### 4. Build everything

```bash
pnpm turbo build     # builds all workspaces; must be green before a PR
```

## Contributing

1. Read [MILESTONES.md](MILESTONES.md) — work is organized as milestones, each
   with a **verification gate** that must pass before moving on.
2. Standing rules (enforced in review):
   - `numeric` for all money/weight columns — never `real`/floats
   - every table carries `factory_id` and gets an RLS policy **in the same migration**
   - client-generated UUIDs for anything that can be created offline on mobile
3. Keep changes scoped to one milestone; include how you verified them in the PR.

Issues and PRs welcome — especially from anyone who knows the Sri Lankan tea
supply chain. Domain knowledge is as valuable here as code.
