# Field App — Milestone Plan

Build plan for the Phase 2 suppliers/driver field app (issue #13). Product:
[PRODUCT.md](./PRODUCT.md). Design: [ARCHITECTURE.md](./ARCHITECTURE.md).

These milestones (**FA0–FA7**) are the concrete decomposition of the canonical
roadmap's **M12–M17** for this issue. They sit in Phase 2 and assume the Phase 1
ERP continues in parallel. Each is independently shippable with a verification gate,
same discipline as the root [MILESTONES.md](../../MILESTONES.md). Cross-references to
the canonical milestones are noted.

> **Sequencing note.** The canonical plan finishes Phase 1 (M7–M11) before Phase 2.
> Per owner direction on issue #13 we are starting the field app's foundation now as
> a thin vertical slice (FA0–FA2 core), without reprioritising the rest of Phase 1.
> Features that depend on unbuilt Phase-1 modules (water-detection signal → M7;
> geo → M14) are sequenced after their dependency.

> **Status (PR #18).** Shipped & validated live: supplier/driver roles + route
> groups, the `request_types`-driven menu + generic form renderer, FA1 phone/email-
> OTP auth with supplier-scoped RLS, and the full FA2 trust loop (advance →
> approve → M6 deduction → hand-over → acknowledge). FA3 messaging is partially
> built: `supplier_messages` table + RLS, web compose, and the mobile inbox.
> **Deferred:** FA0's `remote_config` table + EAS Update channel config; FA3
> Realtime/push delivery (the inbox currently polls on focus).

---

## FA8 — Field customer registration  ⬅ SHIPS FIRST, ahead of FA0
The only field-app surface going to the factory right now. A `field_officer`
logs in with a username and password, is bound to that one phone, picks the
**line** they are working, and registers customers onto it — capturing the GPS
fix that FA5 route optimisation will later order stops by.

- Registry (web only): `vehicles`, `drivers`, `lines` (one vehicle per line),
  `line_drivers` (a line takes 1..n drivers). Field officers read these; they
  never create them.
- `suppliers` gains `customer_no` (the identifier the customer already carries
  in the factory's existing system — text, unique per factory), `line_id`
  (composite FK, so a customer can never be put on another tenant's line),
  `address`, `cultivated_area_acres`, photo/bank-book paths, bank account
  fields, GPS accuracy/timestamp, and registration provenance.
- Per-device auth: `user_devices` + `register_device()`; the phone's
  secure-storage id rides on every request as `x-device-id`, and a RESTRICTIVE
  RLS policy refuses a field officer's write from any other handset. Owners
  and managers release a lost phone from *Bound devices*.
- Private `supplier-documents` bucket, pathed `factory_id/supplier_id/`.
- App flow: **line list → customers on that line → register customer**, so the
  line is chosen once and never re-asked per customer.

**Verify:** `db:verify-rls`, `db:verify-auth` and `db:verify-device-binding`
pass; a field officer registers a customer from the bound phone and the same
insert is refused from a second device; the customer, its line, and its map
location appear on the web suppliers list.

**Deferred from this milestone:** offline outbox (online-only for now, but
`client_uuid` is already stored as the idempotency key), and OCR of the bank
book into `bank_account_no` (`bank_parse_status` is written as `pending` and a
person confirms before the number is trusted for money).

## FA0 — Field-app foundation & dynamic-update spine  ⬅ building now
Repurpose the parked `apps/mobile` shell for two field roles and stand up the
dynamic-update mechanism so later features can be DB-only.

- Add `supplier` + `driver` roles; role-gated route groups (`(supplier)`,
  `(driver)`), with the old M4 collector screens removed/parked.
- `remote_config` + `request_types` tables (schema + RLS) and a client config
  fetch/cache (`lib/config.ts`); a generic form renderer over a field schema.
- EAS Update configured (channels), documented in the README so OTA pushes work.

**Verify:** typecheck passes; `db:verify-rls` passes with the new tables; the app
boots, reads `request_types` from the DB, and renders a menu item that exists only
because of a DB row (proving tier-1 dynamic UI); an EAS Update channel is configured.

## FA1 — Supplier & driver phone-OTP auth  (canonical M12 on-ramp)
- Supabase phone OTP login screen; session → role + `factory_id` resolution.
- `supplier_logins` linkage to existing `suppliers` rows (+ lat/lng columns on
  `suppliers` for registration, captured but optional until FA5).
- RLS: supplier-scoped policies (a supplier reads only their own rows).

**Verify:** a seeded supplier logs in by phone OTP, lands on the supplier home, and
RLS proves they cannot read another supplier's or another factory's rows
(`db:verify-rls`). A driver logs in and lands on driver home.

## FA2 — Requests + money-acknowledgement trust loop  (the slice's payoff)
- `supplier_requests` (dynamic `type` + jsonb payload + status machine + client
  UUID). Supplier raises advance / fertiliser / tea-packet requests from the
  DB-driven menu.
- Web ERP: owner/manager sees pending requests, approves/declines; an approved
  **advance** writes an M6 `supplier_adjustments` deduction (real ERP integration).
- Acknowledgement state machine `approved → handed_to_driver → acknowledged`,
  OTP-gated on the supplier's confirmation; "handed but not acknowledged" surfaces
  on the web as the driver-didn't-deliver signal.

**Verify (vertical-slice gate):** supplier raises an advance on the phone → owner
approves on the web → an M6 deduction appears on that supplier's statement → supplier
acknowledges receipt with OTP → the web shows it acknowledged; a request left at
`handed_to_driver` shows as an unacknowledged-cash alert. `db:verify-rls` passes.

## FA3 — Messaging from the factory  (canonical M17 slice)
- `messages` table (broadcast + targeted, read state); web compose UI; Realtime
  delivery + expo-notifications push; offline users receive on next sync.

**Verify:** factory sends a broadcast and a targeted message; both appear on the
supplier app (push when online, on sync when offline) with correct read state.

## FA4 — Driver route & field quality flag  (canonical M13/M7 bridge)
- `driver_routes` / `route_stops`; driver sees ordered stops with derived per-stop
  tasks: cash to hand over (FA2 approvals), deliveries, delivery-ready inquiries.
- Driver marks watered/poor leaf at a stop → writes a quality flag feeding the M7
  out-turn / supplier-quality signal (lands fully when M7 exists; the flag is
  captured now).

**Verify:** a driver opens a route and sees each stop with its real pending tasks
pulled from `supplier_requests`/advances; marking a stop's leaf as watered writes a
flag visible on the web.

## FA5 — Offline sync + geo/route optimisation  (canonical M13 offline + M14)
- Offline outbox (expo-sqlite) for writes; cache-first reads; airplane-mode flush.
- Geocode supplier locations; route ordering (nearest-neighbour over Directions/OSRM,
  swappable).

**Verify:** airplane-mode requests/acknowledgements land exactly once after
reconnect, surviving an app kill and a mid-push failure; a driver's stops come back
in an optimised order.

## FA6 — Loyalty & nudges  (reuses M6 calc)
- Birthday wishes; superleaf promotions; the "you could have earned Rs X more"
  nudge computed by the shared `packages/api` missed-bonus engine.

**Verify:** a supplier below superleaf sees the correct missed-bonus figure for the
period, matching the web statement to the cent.

## FA7 — Bluetooth scale  (future, forces a store release)
- Native BLE module; read weights directly into the driver app; write `weighings`
  with client UUIDs.

**Verify:** a paired scale reading creates a weighing that reconciles to a manual
entry; offline-captured readings sync idempotently.

## Future scope — SMS bridge (no app)
Suppliers without smartphones interact via SMS over a Sri Lankan gateway, writing the
same `supplier_requests`/acknowledgement tables so both channels share one data
model. Not scheduled; designed-for in the schema now.

---

## Standing rules (inherited from the root plan)
- `numeric` for money/weight; `factory_id` + index + **RLS policy in the creating
  migration** on every new table; `db:verify-rls` after schema changes.
- Client-generated UUIDs on anything creatable offline (every field table).
- New roles/access live only in `apps/web/lib/roles.ts`; never inline role checks.
- Publishable key + JWT only on the client; secret key server-side.
- Prefer a **DB row** over an **OTA push** over a **store release** for any change
  (the dynamic-update contract in ARCHITECTURE.md).
