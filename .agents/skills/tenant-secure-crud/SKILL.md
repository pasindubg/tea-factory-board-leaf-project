---
name: tenant-secure-crud
description: Enforce Tea Factory Ops tenant-safe database access. Use whenever creating, changing, reviewing, or debugging any CRUD action, server action, database query, Supabase table access, RPC, record list mutation, import persistence, schema table, foreign key, RLS policy, or tenant/user-scoped view anywhere in board-leaf-project.
---

# Tenant-secure CRUD golden policy

Treat this policy as a release-blocking invariant. A feature is incomplete if
any item below is missing, even when its visible behavior works.

## Mandatory access path

1. Authenticate and authorize on the server with `requireProfile` or
   `requireModuleAccess` before reading or mutating tenant data.
2. Use only the Supabase client returned by that gate. It is wrapped by
   `withTenantDataScope` in `apps/web/lib/tenant-data.ts`.
3. Register every tenant table in the allowlist in `tenant-data.ts`. Do not work
   around an unregistered-table error with a raw client.
4. Obtain `factory_id` and the acting user from the authenticated profile. Never
   accept `factory_id`, `user_id`, a table name, a policy name, or a cascade flag
   from the browser as authorization authority.
5. Keep entity-specific server actions. Shared CRUD infrastructure enforces
   tenant boundaries; domain actions still enforce roles, state transitions,
   validation, auditing, and other business rules.

## Schema and RLS requirements

- Give every factory-owned domain table a non-null `factory_id`, an index that
  supports its tenant access path, and a foreign key to `factories`.
- Enable RLS and add the factory-isolation policy in the same migration that
  creates the table. Use both `USING` and `WITH CHECK` against
  `public.current_factory_id()` for authenticated CRUD.
- Keep Drizzle schema declarations, SQL migrations, and the live database
  constraint behavior aligned.
- Keep RLS authoritative. The application tenant wrapper is defense in depth,
  not a replacement for database enforcement.
- Use the session client for tenant data. The admin/secret client is allowed only
  for authentication-side operations such as creating, banning, or deleting a
  login.

## CRUD rules

- Reads, inserts, updates, upserts, and deletes must pass through the scoped
  client returned by the profile/module gate.
- Never trust a client-provided foreign key. Verify referenced entities through
  the same scoped client before attaching them when domain validation requires
  a clear error.
- Factory-wide access and user-specific access are different. The tenant wrapper
  supplies factory isolation; collector/owner/actor ownership rules must also be
  expressed in domain predicates and RLS where the data is user-restricted.
- Do not use a generic browser-controlled endpoint that accepts a table name or
  arbitrary mutation payload.
- Framework list refreshes use the central server-only read-model registry.
  Browser requests contain only a compile-time resource key and that resource's
  strictly parsed context parameters. The registry, not the browser, owns the
  table, projection, tenant/actor predicates, module authorization, and row
  mapping. Never create entity-specific refresh actions or a generic
  client-selected table/query endpoint; soft refresh changes only matching
  mounted list instances and explicitly invalidated dependent lists.
- RPC/database functions must derive or validate tenant identity from the
  authenticated session and preserve RLS. Do not pass a client-supplied factory
  identifier through an unguarded privileged function. Avoid `SECURITY DEFINER`
  unless the repository's established, audited pattern explicitly requires it.

## Delete and relationship rules

- Use `deleteTenantRow` for user-triggered entity deletes after the entity action
  has completed its role and domain checks.
- Declare relationship behavior on the foreign key in Drizzle and its migration:
  use restrictive/no-action behavior when history or referenced data must block
  deletion; use `onDelete: "cascade"` only when the child is wholly owned by the
  parent and must not survive it; use `set null` when history remains meaningful
  without the actor/reference.
- Never implement cascade as a client option. PostgreSQL must execute cascades
  atomically. Restricted deletes must surface the shared friendly dependency
  error naming the dependent record type.
- Do not manually delete historical/accounting children merely to bypass a
  foreign-key error. Make the domain retention decision explicit in the schema.

## Required verification

Before reporting a CRUD change complete:

1. Add or update tests covering factory scoping, malicious `factory_id`
   replacement, cross-tenant IDs, permission denial, and delete dependency
   behavior relevant to the change.
2. Run web tests plus `pnpm --dir apps/web typecheck` and
   `pnpm --dir apps/web lint`.
3. Run `pnpm --dir packages/db typecheck` after schema changes.
4. Source `.env`, then run `pnpm --dir packages/db db:verify-rls` and
   `pnpm --dir packages/db db:verify-auth` after schema, RLS, auth, role, or
   permission changes.
5. Inspect the generated migration and, when a database is available, verify the
   live policy/constraint with a read-only query. Never claim a cascade or RLS
   rule is live based only on TypeScript.

When reviewing existing work, treat a violation as a security defect and fix or
report it explicitly; do not silently preserve the pattern for consistency.
