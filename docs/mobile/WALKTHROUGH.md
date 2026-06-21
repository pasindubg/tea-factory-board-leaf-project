# Field App — Build Walkthrough (issue #13)

A guide to what was built for the suppliers/driver mobile app and how it works,
written for someone new to the repo (or future-me). Companion docs:
[PRODUCT.md](./PRODUCT.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) ·
[MILESTONES.md](./MILESTONES.md).

## What this delivers

The first **vertical slice** of the Phase-2 field app: a supplier can raise an
**advance request** from their phone, the factory **approves** it on the web ERP
(which posts a real payment deduction), a **driver** marks the cash handed over,
and the supplier **acknowledges receipt** — the loop that catches a driver who
didn't actually deliver the money. It exercises every layer end-to-end (mobile →
RLS-isolated DB → web ERP → payment ledger) so the rest of the features
(FA3–FA7 in [MILESTONES.md](./MILESTONES.md)) slot onto a proven spine.

## The end-to-end flow

```
SUPPLIER (phone)            FACTORY (web ERP)            DRIVER (phone)
─────────────────          ──────────────────          ────────────────
Pick "Advance" from
the request menu  ───────▶ appears in Pending
(menu comes from a
 DB row, not the app)
                           Approve  ─────────────────▶ writes an M6
                           │                            supplier_adjustments
                           │                            "advance" deduction
                           ▼
                           (status: approved)  ───────▶ shows on driver route
                                                        with the amount
                                                        │
                                                        Mark handed over
                                                        │
                           ◀──────────────────────────  (status:
                           "⚠ handed, not                handed_to_driver)
                            acknowledged" alert
Confirm I received  ─────▶ (status: acknowledged)
the money (OTP-gated                    alert clears
session)
```

The **status machine** lives on one row (`supplier_requests.status`):
`pending → approved → handed_to_driver → acknowledged` (plus `declined` /
`cancelled`). Every transition is stamped with who/when, so "handed but never
acknowledged" is a queryable fraud signal, not a guess.

## What was built (file map)

**Database — `packages/db`**
- `src/schema/request-types.ts` — the catalogue that powers the dynamic request
  menu (a new request type is a row, no app release).
- `src/schema/supplier-requests.ts` — the request + status machine, client-UUID PK.
- `src/schema/suppliers.ts` — added `latitude`/`longitude` (registration location).
- `src/schema/users.ts` — added `supplier`/`driver` roles + `supplier_id` link.
- `drizzle/0006_fa_field_app.sql` — migration with **RLS in-migration**: factory
  isolation on both tables, supplier-scoping via a new `current_supplier_id()`
  helper (a supplier can't see another's requests), management-only catalogue writes.

**Web ERP — `apps/web`**
- `app/dashboard/requests/page.tsx` — review surface, four lanes incl. the
  ⚠ handed-not-acknowledged alert.
- `app/dashboard/requests/actions.ts` — `approveRequest` (writes the M6 advance
  deduction + links it), `declineRequest`, `handToDriver`.
- `lib/roles.ts` — registered the `requests` module + the two new roles.

**Mobile field app — `apps/mobile`**
- `app/login.tsx` — phone-OTP (primary) with an email fallback for dev testing.
- `app/_layout.tsx` / `app/index.tsx` — route by role (supplier vs driver group).
- `app/(supplier)/` — `home` (DB-driven menu), `new-request` (generic form from the
  type's field schema), `requests` (status list + the acknowledge button).
- `app/(driver)/home.tsx` — route view; mark cash handed over.
- `lib/session.tsx` / `lib/types.ts` — load the supplier link; shared row shapes.

## How "no reinstall" updates work (issue #13 requirement)

Three tiers, cheapest first (full detail in [ARCHITECTURE.md](./ARCHITECTURE.md)):
1. **DB row** — the request menu and each form are rendered from `request_types`.
   Add "pesticide loan" or a new field = INSERT/UPDATE. No app change at all.
2. **OTA (EAS Update)** — real code changes ship over-the-air on next launch.
3. **Store release** — only for native changes (e.g. the future Bluetooth scale).

## How to run / preview it

```bash
# one-time, in the worktree
export PATH="/Users/pasindu/.nvm/versions/node/v20.20.2/bin:/Users/pasindu/.npm-global/bin:$PATH"
pnpm install

# typecheck everything (passes today)
pnpm turbo typecheck

# apply the DB migration (creates request_types + supplier_requests + RLS)
cd packages/db && set -a; . ../../.env; set +a
NODE_OPTIONS=--experimental-websocket pnpm db:migrate
pnpm db:verify-rls            # tenant-isolation gate

# web ERP  → http://localhost:3000   (preview server "web")
# mobile   → http://localhost:8081   (preview server "mobile-web", Expo web)
```

To exercise it you also need a little data: a few `request_types` rows for a
factory (one with `creates_advance = true`), and a `supplier`-role login whose
`users.supplier_id` points at a `suppliers` row.

### Known gates before a live demo
- **Migration not yet applied** to the shared Supabase DB — it's the live
  customer-zero database, held for an explicit go-ahead. It is additive
  (new tables + nullable columns), so low-risk.
- **Phone-OTP login needs an SMS provider** (Twilio or a Sri Lankan gateway) —
  an open decision in [ARCHITECTURE.md](./ARCHITECTURE.md). Until then, use the
  email tab + `pnpm db:mint-otp <email>` for a test login.

## Verification status
- ✅ `pnpm turbo typecheck` — all 7 packages green.
- ⏳ `db:verify-rls`, applying the migration, and the Expo-web walkthrough —
  pending the migration apply (live DB) + a test login.
