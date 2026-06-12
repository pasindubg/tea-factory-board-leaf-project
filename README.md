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
| M5 | User management + restricted collector web UI | 🔜 current |
| M6–M9 | Payments, production/out-turn, sifting & grades, deploy | planned |
| M10–M15 | Phase 2: marketplace + field app with offline sync | planned |

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
- **Docker** (optional) — for a local Postgres instead of a cloud Supabase project

### 1. Clone and install

```bash
git clone <repo-url> && cd board-leaf-project
pnpm install
```

### 2. Set up the database

You need either a free [Supabase](https://supabase.com) project **or** local
Postgres via Docker.

**Option A — cloud Supabase (full feature set, including auth):**

```bash
cp .env.example .env
# Fill in from your Supabase dashboard:
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (Project Settings → API)
#   SUPABASE_SECRET_KEY                                             (Project Settings → API Keys)
#   DATABASE_URL — use the SESSION POOLER connection string         (Connect button)
```

**Option B — local Postgres (no account needed; auth scripts won't run):**

```bash
docker run -d --name tea-factory-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
docker exec -i tea-factory-pg psql -U postgres < packages/db/scripts/local-pg-shim.sql
# .env: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres
```

Then migrate and seed (from `packages/db/`):

```bash
pnpm db:migrate      # apply Drizzle migrations (schema + RLS policies)
pnpm db:seed         # 2 demo factories with suppliers and weighings
pnpm db:verify-rls   # prove tenant isolation holds (6 checks)
pnpm db:link-auth    # cloud only: create real auth users for the seed emails
pnpm db:verify-auth  # cloud only: end-to-end auth + RLS gate
```

### 3. Run the web app

```bash
ln -s ../../.env apps/web/.env.local   # share root env with Next.js
pnpm --dir apps/web dev                # http://localhost:3000
```

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
