# Tea Factory Ops — Field App (Suppliers & Drivers)

Product & feature description for the **Phase 2 mobile field app**. This is the
companion to the factory ERP (`apps/web`); it puts the two field personas — the
**leaf supplier** and the **route driver** — on their phones, integrated with the
same Supabase backend the ERP already runs on.

Read [docs/PRODUCT.md](../PRODUCT.md) (the ERP product guide) first; this file
inherits its vision, multi-tenancy rules, and superleaf/quality model and only
documents what the field app adds. Build plan: [MILESTONES.md](./MILESTONES.md).
Technical design: [ARCHITECTURE.md](./ARCHITECTURE.md). Tracks GitHub issue #13.

## The idea in one paragraph

The factory already runs the ERP at the gate. The field app extends that loop to
the two people who are *not* at a desk: the **supplier** (estate owner /
smallholder, in the field) and the **driver** (lorry route collector). Suppliers
register, request advances/fertiliser/tea packets, signal when leaf is ready,
receive messages from the factory, and **acknowledge money received** — closing a
trust gap where cash passes hand-to-hand through a driver. Drivers see their
route, each stop's pending tasks (cash to hand over, deliveries to make, inquiries
to service), and can flag watered leaf at the point of collection. Everything reads
and writes the same `factory_id`-scoped tables the ERP uses, so a request raised on
a phone is a row the owner sees on the web dashboard a second later.

## Who uses what (personas & devices)

| Persona | Where | Device | App | New? |
|---|---|---|---|---|
| Leaf supplier / estate owner | In the field, often offline | Phone (Android-heavy, low-end) | **Field app** | new mobile role |
| Route driver / collector-in-lorry | On the road | Phone | **Field app** (driver mode) | **new persona** |
| Factory owner / manager | Office | Desktop | Existing web ERP | unchanged |
| Collector / weighing clerk | Desk at gate | Desktop | Existing web ERP | unchanged |

Notes that shape the design:
- **Drivers are a new persona.** The June-2026 re-plan moved the *gate* collector to
  desktop, but the *lorry* driver who visits suppliers on a route is genuinely in
  the field — they get a driver mode in this app.
- **Suppliers are low-connectivity, low-end Android, often non-English.** Offline
  tolerance, small bundle, and Sinhala/Tamil/English language support are
  first-class, not polish.
- **Some suppliers have no smartphone.** An SMS bridge for them is explicit future
  scope (see below), designed for from day one but not built now.

## Feature catalogue (from issue #13)

Each feature notes its **persona**, its **ERP integration point** (the existing
table/module it reads or writes), and the **milestone** it lands in. "DB-only"
marks features deliverable to users with no app reinstall (see dynamic-update
principle below).

| # | Feature | Persona | ERP integration | Milestone |
|---|---|---|---|---|
| 1 | **Supplier registration** (with map location captured at signup) | Supplier | new `supplier` identity links to existing `suppliers` row | FA1 / M12 |
| 2 | **Phone-number OTP security** for login, money requests, and acknowledgements | Supplier, Driver | Supabase phone auth + `factory_id` RLS | FA1 / M12 |
| 3 | **Requests**: advances, fertiliser, tea packets | Supplier | new `supplier_requests`; advances feed payment deductions (M6 `supplier_adjustments`) | FA2 |
| 4 | **Delivery-ready inquiry** for irregular suppliers | Supplier | `supplier_requests` (type `delivery_ready`) → driver route stop | FA2 / FA4 |
| 5 | **Money-received acknowledgement** (detect driver non-delivery) | Supplier | acknowledgement on advance/payment hand-off, OTP-gated | FA2 |
| 6 | **Messages from the factory** (broadcast + per-supplier) | Supplier | new `messages` + Supabase Realtime + push | FA3 |
| 7 | **Driver route view**: stops, with pending advances/payments to hand over and deliveries to make on that visit | Driver | reads `supplier_requests`, advances, supplier locations | FA4 |
| 8 | **Mark watered/poor leaf at collection** | Driver | writes a quality flag that feeds the M7 out-turn / supplier-quality signal | FA4 |
| 9 | **Map location at registration + route optimisation** | Supplier, Driver | supplier geocode; route ordering over stops | FA5 / M14 |
| 10 | **Birthday wishes; superleaf promotions; "you could have earned X more"** | Supplier | reuses M6 "bonus missed" calc in `packages/api` | FA6 |
| 11 | **Bluetooth scale → direct weight capture** in driver app | Driver | writes `weighings` (client UUID idempotency already in schema) | FA7 (future) |
| 12 | **SMS bridge for suppliers without smartphones** | Supplier | same `supplier_requests` / acknowledgement tables via inbound/outbound SMS | future scope |

### The vertical slice built first (FA1 + the core of FA2)

To prove the architecture end-to-end against the real ERP, the first build is the
narrowest path that touches every layer:

1. **Supplier & driver phone-OTP auth** — a field user logs in with a phone number,
   resolves to a `factory_id` and role, RLS isolates them.
2. **Advance request → factory approval → supplier acknowledgement** — a supplier
   raises an advance request; the owner sees and approves it on the web dashboard
   (writing an M6 advance deduction); on hand-over the supplier acknowledges receipt
   with an OTP-gated confirmation. This single flow exercises auth, the new
   `supplier_requests` table + RLS, ERP write-back into existing payment data, and
   the acknowledgement trust loop.

Everything else is sequenced as milestones in [MILESTONES.md](./MILESTONES.md).

## The dynamic-update principle (a hard requirement from #13)

> "Incremental feature additions should be easily added with only a db/backend
> update, not by reinstalling/updating the mobile app."

Two mechanisms together satisfy this — see [ARCHITECTURE.md](./ARCHITECTURE.md) for
the implementation:

1. **OTA code updates (Expo EAS Update).** JS/bundle changes ship over-the-air; the
   app picks them up on next launch with no App Store / Play Store review and no
   user reinstall. Covers genuine code changes.
2. **Server-driven content & features (remote config + generic forms).** The app
   renders its action menu, request types, and form fields from data fetched from
   the backend. Adding a new request type (say "pesticide loan") or toggling a
   feature for a factory is **inserting a row**, not shipping code. This is what
   makes "DB-only" features in the table above real.

The combination means: small/structural changes = DB row; logic changes = OTA push;
a full store release is reserved for native-module changes (e.g. adding the
Bluetooth-scale dependency).

## Security & trust model

- **Phone OTP** on login and re-verified before sensitive actions (raising a money
  request, acknowledging receipt) so a lost/unlocked phone can't move money or
  falsely confirm a payment on a supplier's behalf.
- **RLS everywhere**, same as the ERP: every new table carries `factory_id` and a
  factory-isolation policy in the creating migration. Supplier identity in Phase 2
  becomes relationship-scoped (a supplier ↔ factory link) per M12 — designed for,
  enforced when M12 lands.
- **Acknowledgement integrity**: the hand-over of cash is a state machine —
  `approved → handed_to_driver → acknowledged_by_supplier` — each transition stamped
  with actor + timestamp. A payment stuck at `handed_to_driver` with no supplier
  acknowledgement is the exact signal the factory wants ("did the driver actually
  give the money?").
- Client bundles only ever hold the Supabase **publishable** key + the user JWT; the
  secret key stays server-side, identical to the ERP boundary.

## Future scope (designed-for, not built now)

- **Bluetooth scale integration** — read weights directly into the driver app. Needs
  a native module, so it is the one feature that forces a store release; the
  `weighings` schema already uses client-generated UUIDs so captured weights sync
  idempotently.
- **SMS bridge** for suppliers without smartphones — inbound keywords / outbound
  notifications over a Sri Lankan SMS gateway, writing the same request and
  acknowledgement tables so the two channels converge on one data model.
- **Loyalty/marketing** — birthday wishes, superleaf promotions, and the
  "you-could-have-earned" nudge reuse the M6 missed-bonus computation.
