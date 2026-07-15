import { sql } from "drizzle-orm";
import { pgTable, uuid, text, numeric, jsonb, timestamp, index, check } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { suppliers } from "./suppliers";
import { users } from "./users";
import { supplierAdjustments } from "./supplier-adjustments";

// A request raised by a supplier from the field app (advance, fertiliser, tea
// packets, delivery-ready inquiry, …). Created with a client-generated UUID for
// offline idempotency, exactly like `weighings`.
//
// Status machine — the money-handover trust loop from issue #13:
//   pending → approved | declined
//   approved → handed_to_driver → acknowledged
// A row left at `handed_to_driver` with no `acknowledgedAt` is the
// "did the driver actually give the supplier the money?" alert on the web.
export const supplierRequests = pgTable(
  "supplier_requests",
  {
    id: uuid("id").primaryKey(), // client-generated UUID (offline idempotency)
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    typeKey: text("type_key").notNull(), // mirrors request_types.key
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    amount: numeric("amount", { precision: 12, scale: 2 }), // for advances etc.
    status: text("status", {
      enum: ["pending", "approved", "declined", "handed_to_driver", "acknowledged", "cancelled"],
    })
      .notNull()
      .default("pending"),
    note: text("note"),
    requestedAt: timestamp("requested_at").defaultNow().notNull(),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at"),
    handedBy: uuid("handed_by").references(() => users.id, { onDelete: "set null" }),
    handedAt: timestamp("handed_at"),
    acknowledgedAt: timestamp("acknowledged_at"),
    // link to the M6 deduction created when an advance request is approved
    adjustmentId: uuid("adjustment_id").references(() => supplierAdjustments.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_supplier_requests_factory").on(t.factoryId),
    index("idx_supplier_requests_supplier").on(t.supplierId),
    index("idx_supplier_requests_status").on(t.status),
    check(
      "supplier_requests_status_check",
      sql`${t.status} IN ('pending', 'approved', 'declined', 'handed_to_driver', 'acknowledged', 'cancelled')`,
    ),
  ],
);
