import { pgTable, uuid, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { settlements } from "./settlements";

// One row per deduction line in an Account Sales settlement (insurance,
// public sale ex., brokerage, handling, documentation, charges-VAT,
// govt relief loan, e-platform). The `basis` field encodes which formula
// was used: per_kg, per_lot, pct, flat (docs/AUCTION.md §7).
export const settlementCharges = pgTable(
  "settlement_charges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    settlementId: uuid("settlement_id")
      .references(() => settlements.id)
      .notNull(),
    code: text("code").notNull(), // insurance, public_sale_ex, brokerage, handling, documentation, charges_vat, govt_relief_loan, eplatform
    label: text("label").notNull(),
    basis: text("basis", { enum: ["per_kg", "per_lot", "pct", "flat"] }).notNull(),
    rate: numeric("rate", { precision: 12, scale: 4 }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    sortOrder: numeric("sort_order", { precision: 4, scale: 0 }).default("0").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_settlement_charges_settlement").on(t.settlementId),
    index("idx_settlement_charges_factory").on(t.factoryId),
  ],
);
