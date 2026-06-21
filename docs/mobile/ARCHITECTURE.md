# Field App — Architecture & Tech Stack

Technical design for the Phase 2 suppliers/driver field app. Product context:
[PRODUCT.md](./PRODUCT.md). Build plan: [MILESTONES.md](./MILESTONES.md).

The guiding constraint: **this is not a new product, it is a new surface on the
existing system.** It shares the ERP's database, RLS, types, and payment engine. So
the architecture is mostly "extend what's there," and the genuinely new design work
is (a) field-user identity & phone auth, (b) the dynamic-update mechanism, and
(c) offline tolerance.

## Tech stack & rationale

| Concern | Choice | Why (and what it reuses) |
|---|---|---|
| App framework | **Expo (React Native), SDK 56** | Already in `apps/mobile`; one codebase → iOS + Android (+ web for preview testing). |
| Navigation | **expo-router** (file-based) | Already wired; role-based route groups. |
| Backend | **Supabase** (Postgres + Auth + Realtime + Storage) | The ERP's backend — zero new infra. Field writes are just RLS-scoped rows the web reads. |
| Shared data layer | **`packages/db`** (Drizzle schema + types) | One schema, one source of truth; mobile imports the same types the web uses. |
| Shared business logic | **`packages/api`** | The tested payment/superleaf calc engine powers the "missed bonus" nudge — no re-implementation. |
| Auth | **Supabase phone OTP** | Field users have phones, not email. Distinct from the web's email OTP. |
| Server cache / fetching | **TanStack Query** | Cache-first reads for offline tolerance; thin, no global-state framework (per the repo's simplicity preference). |
| Client IDs | **expo-crypto UUIDs** | Already the pattern in `weighings`; idempotency key for offline sync. |
| OTA updates | **EAS Update** | Ship JS without a store release — half of the dynamic-update requirement. |
| Maps & geo | **react-native-maps** + Google/OSRM directions | Location capture at registration; route ordering (FA5). |
| Offline store | **expo-sqlite outbox** (evaluate vs WatermelonDB) | Per M13: lighter outbox first; server wins on conflict; client UUIDs make pushes idempotent. |
| Push & realtime | **expo-notifications** + Supabase Realtime | Factory→supplier messages and route updates. |
| i18n | **Sinhala / Tamil / English** | Suppliers/drivers are often non-English; a launch requirement, not polish. |

**Not chosen, deliberately:** no separate API server (Supabase + Next.js server
actions cover it), no Redux/MobX (TanStack Query + local state is enough), no custom
native build until the Bluetooth scale forces one. Keep it boring; add only when a
feature demands it.

## Where the code lives (monorepo integration)

```
apps/mobile/                 Expo field app (this project)
  app/
    (auth)/                  phone-OTP login
    (supplier)/              supplier role route group
    (driver)/                driver role route group
    _layout.tsx              role gate → routes to the right group
  features/<feature>/        screen + hooks + queries per feature (requests, messages, route…)
  lib/
    supabase.ts              session client (publishable key + JWT)
    session.tsx              auth/session context, role + factory resolution
    config.ts                remote-config fetch + cache (dynamic UI)
    outbox.ts                offline write queue (added in the offline milestone)
packages/db/src/schema/      shared schema — NEW field tables added here
packages/api/                shared calc engine — reused for "missed bonus"
```

New backend tables follow the **exact ERP module recipe** (schema file + index
export + migration with `factory_id` + index + RLS policy in the same migration).
No mobile-specific backend — the phone app and the web app are two clients of one
RLS-enforced Postgres.

## Identity & auth model

- **Phone OTP** via Supabase Auth. A field user enters their number, gets an SMS
  code, and a session JWT. (SMS provider is an open decision — see below.)
- **Roles** extend the existing registry: add `supplier` and `driver`. The web
  `Role` union and `apps/web/lib/roles.ts` stay the source of truth; mobile reads the
  same role to pick its route group. Web modules simply don't list the new roles, so
  field users get no web surface.
- **Phase-1-compatible supplier linkage**: today a supplier is a `suppliers` row
  owned by one factory. The field app introduces a supplier *login* that links to
  that row (a `supplier_user_id` on the row, or a link table). This is the on-ramp to
  M12's full relationship model — we add the login now without yet making suppliers
  cross-tenant, so Phase 1 factories keep working unchanged.
- **RLS**: every new table is `factory_id`-scoped with the standard
  `factory_isolation` policy + `WITH CHECK`. Supplier-facing policies additionally
  scope to "rows belonging to *this* supplier" so one supplier can't read another's
  requests. `db:verify-rls` must pass after every migration.

## The dynamic-update mechanism (issue #13's core requirement)

Three tiers, cheapest first:

1. **DB-only (no app change at all).** A `remote_config` / feature surface the app
   reads on launch and caches:
   - **Request types** are rows (`request_types`: key, label-by-locale, fields
     schema, enabled-per-factory). The supplier "Request" screen renders the menu and
     each request's form **from this data**. Adding "pesticide loan" = insert a row.
   - **Feature flags & content** (announcement banners, which tiles show) are config
     rows, per factory. Flipping a feature on for one factory is an UPDATE.
   - Forms are rendered by a small generic form renderer over a field schema
     (`{name, type, label_i18n, required}`), so new fields need no new screens.
2. **OTA code push (EAS Update).** Real logic/UI code changes ship as a JS bundle
   over-the-air; users get them on next launch, no reinstall, no store review.
3. **Store release (rare).** Only when native modules change (e.g. adding the
   Bluetooth-scale library). Designed to be infrequent.

This ordering is the contract: **prefer a DB row, fall back to OTA, release to the
store only for native changes.** New "request types," promotions, messages, and
most field tweaks never leave tier 1.

## Data model additions (first migrations)

Sketch — finalised when each milestone builds; all carry `factory_id` + index + RLS.

- `request_types` — catalogue powering the dynamic request menu (key, i18n labels,
  field schema, enabled flag). Drives tier-1 dynamic UI.
- `supplier_requests` — a supplier's request: `type` (FK request_types), `payload`
  (jsonb for the dynamic fields), `status`
  (`pending → approved/declined → handed_to_driver → acknowledged`), amounts where
  relevant, `client_uuid` (offline idempotency), actor/timestamp stamps per
  transition. Advance approvals write an M6 `supplier_adjustments` deduction.
- `acknowledgements` (or a status machine on the request/payment) — the money-handed
  trust loop, OTP-gated, with the gap signal "handed but not acknowledged."
- `messages` — factory→supplier broadcast + targeted, with read state; Realtime +
  push delivery.
- `driver_routes` / `route_stops` — a driver's stops with derived tasks (cash to
  hand over, deliveries, delivery-ready inquiries); optimisation added in FA5.
- `supplier_logins` linkage + geocode columns on `suppliers` (lat/lng captured at
  registration).

## Offline sync

- **Reads**: TanStack Query cache persists; the app is usable read-only offline.
- **Writes**: queued in an **outbox** (expo-sqlite), each tagged with a client UUID.
  On reconnect the outbox flushes; the server is authoritative on conflict; client
  UUIDs make a re-sent write a no-op. Target test (M13 gate): airplane-mode actions
  land exactly once after reconnect, surviving an app kill and a mid-push failure.
- Built in the offline milestone (FA-offline / M13), not the first slice — but the
  client-UUID columns are added from the first table so we never migrate them in
  later.

## Messaging, notifications, maps

- **Messaging**: `messages` table + Supabase Realtime channel per supplier; offline
  users get them on next sync; push via expo-notifications.
- **Route & maps**: supplier lat/lng captured at registration (react-native-maps +
  device GPS). Driver route = ordered stops; optimisation (FA5) starts as a
  nearest-neighbour ordering over Google Directions / OSRM, kept swappable.

## Open decisions (carry these, don't silently pick)

- **SMS/OTP provider**: Supabase phone auth needs an SMS sender. Options: Twilio
  (simple, costs USD) vs a Sri Lankan gateway (Dialog / Notify.lk / Text.lk — cheaper
  local rates, more integration work). Confirm with the factory before FA1 ships to
  real users. *(Recommendation: Twilio for dev/testing, evaluate a local gateway for
  production cost.)*
- **Offline library**: expo-sqlite outbox vs WatermelonDB — decide at the offline
  milestone against a real flush test, not now.
- **Route optimisation engine**: Google Directions (easy, paid, needs key) vs
  self-hosted OSRM (free, ops overhead). Decide at FA5.
- **Supplier↔factory model timing**: the lightweight `supplier_login` linkage now vs
  the full cross-tenant M12 relationship model — we add the login now, defer
  cross-tenant until M12 so Phase 1 isolation stays simple.
