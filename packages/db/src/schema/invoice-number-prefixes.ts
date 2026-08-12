import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { users } from "./users";

// Owner-editable numbering "books" for broker/regular invoices. Only one
// prefix per (factory, category) may be active at a time — that's the prefix
// new invoices are stamped with; any other existing prefix is "abnormal" and
// routes non-management roles through invoice_prefix_exceptions instead.
export const invoiceNumberPrefixes = pgTable(
  "invoice_number_prefixes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    category: text("category").notNull(), // 'broker_invoice' | 'regular_invoice'
    prefix: text("prefix").notNull(), // e.g. "26B01"
    active: boolean("active").default(false).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    activatedBy: uuid("activated_by").references(() => users.id, { onDelete: "set null" }),
    activatedAt: timestamp("activated_at"),
  },
  (t) => [
    index("idx_invoice_number_prefixes_factory").on(t.factoryId),
    uniqueIndex("uq_invoice_number_prefixes_factory_category_prefix").on(t.factoryId, t.category, t.prefix),
    uniqueIndex("uq_invoice_number_prefixes_factory_category_active")
      .on(t.factoryId, t.category)
      .where(sql`"active" = true`),
    check("invoice_number_prefixes_category_check", sql`${t.category} IN ('broker_invoice', 'regular_invoice')`),
  ],
);
