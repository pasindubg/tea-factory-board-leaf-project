import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid, check } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { users } from "./users";
import { invoiceNumberPrefixes } from "./invoice-number-prefixes";

// Approval queue for "abnormal" (non-active) invoice-number-prefix usage.
// A non-management actor who picks a prefix other than the active one gets a
// pending row here instead of the real broker invoice/lot; approving it
// replays the original creation with the requested prefix.
export const invoicePrefixExceptions = pgTable(
  "invoice_prefix_exceptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    category: text("category").notNull(), // 'broker_invoice' | 'regular_invoice'
    requestedPrefixId: uuid("requested_prefix_id")
      .references(() => invoiceNumberPrefixes.id)
      .notNull(),
    contextId: uuid("context_id"), // e.g. the saleId a lot is being added under; null for a new broker invoice
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").default("pending").notNull(), // 'pending' | 'approved' | 'declined'
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }).notNull(),
    requestedAt: timestamp("requested_at").defaultNow().notNull(),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at"),
    createdRecordId: uuid("created_record_id"),
    note: text("note"),
  },
  (t) => [
    index("idx_invoice_prefix_exceptions_factory").on(t.factoryId),
    index("idx_invoice_prefix_exceptions_status").on(t.status),
    check("invoice_prefix_exceptions_category_check", sql`${t.category} IN ('broker_invoice', 'regular_invoice')`),
    check("invoice_prefix_exceptions_status_check", sql`${t.status} IN ('pending', 'approved', 'declined')`),
  ],
);
