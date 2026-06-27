import { pgTable, uuid, text, boolean, integer, jsonb, timestamp, index, unique } from "drizzle-orm/pg-core";
import { factories } from "./factories";

// A dynamic field on a request form, rendered generically by the field app.
// Adding a field here is a DB change, not an app release (server-driven UI —
// see docs/mobile/ARCHITECTURE.md "dynamic-update mechanism").
export type RequestField = {
  name: string;
  type: "text" | "number" | "date" | "boolean";
  label: string;
  required?: boolean;
};

// Catalogue of request types a factory offers its suppliers (advance,
// fertiliser, tea packets, delivery-ready inquiry, …). The supplier app renders
// its request menu and each form FROM these rows, so adding a new request type
// is an INSERT — no app reinstall. `createsAdvance` flags the types whose
// approval writes an M6 advance deduction back into the ERP.
export const requestTypes = pgTable(
  "request_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    key: text("key").notNull(), // 'advance' | 'fertilizer' | 'tea_packets' | 'delivery_ready' | …
    label: text("label").notNull(),
    labelSi: text("label_si"), // Sinhala
    labelTa: text("label_ta"), // Tamil
    fields: jsonb("fields").$type<RequestField[]>().notNull().default([]),
    requiresAmount: boolean("requires_amount").default(false).notNull(),
    createsAdvance: boolean("creates_advance").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_request_types_factory").on(t.factoryId),
    // `key` is referenced by supplier_requests.type_key (text, no FK) and looked
    // up with .maybeSingle() in new-request.tsx — a duplicate (factory_id, key)
    // would let that lookup silently resolve to an arbitrary row.
    unique("uq_request_types_factory_key").on(t.factoryId, t.key),
  ],
);
