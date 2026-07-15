import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { suppliers } from "./suppliers";
import { users } from "./users";

// A message from the factory to suppliers (issue #13: "suppliers should receive
// messages from the factory"; birthday wishes / promotions build on this later).
//
// supplierId NULL = broadcast to every supplier in the factory; otherwise a
// direct message to one supplier. readAt tracks read-state for DIRECT messages
// only — per-recipient read receipts for broadcasts would need a join table and
// are deferred (FA-later); broadcasts show in the inbox but don't drive the
// unread badge.
export const supplierMessages = pgTable(
  "supplier_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    supplierId: uuid("supplier_id").references(() => suppliers.id), // null = broadcast
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
    readAt: timestamp("read_at"), // supplier marked a direct message read
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_supplier_messages_factory").on(t.factoryId),
    index("idx_supplier_messages_supplier").on(t.supplierId),
  ],
);
