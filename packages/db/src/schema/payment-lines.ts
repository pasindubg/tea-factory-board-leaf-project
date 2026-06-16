import { pgTable, uuid, text, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { payments } from "./payments";

// Immutable statement detail, snapshotted when a payment is generated. The
// printable statement renders these rows in order. `amount` is signed: positive
// adds (leaf, bonus), negative deducts (transport, water_penalty, advance,
// other). The payment header's net_amount is the sum of its lines.
export const paymentLines = pgTable(
  "payment_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id")
      .references(() => payments.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    lineType: text("line_type", {
      enum: ["leaf", "bonus", "transport", "water_penalty", "advance", "other"],
    }).notNull(),
    label: text("label"),
    quantity: numeric("quantity", { precision: 12, scale: 2 }), // kg for leaf/bonus lines
    rate: numeric("rate", { precision: 10, scale: 2 }), // per-kg rate where applicable
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), // signed LKR
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_payment_lines_payment").on(t.paymentId),
    index("idx_payment_lines_factory").on(t.factoryId),
  ],
);
