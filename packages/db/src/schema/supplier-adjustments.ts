import { pgTable, uuid, text, numeric, integer, date, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { suppliers } from "./suppliers";
import { users } from "./users";

// Money entered during the month that adjusts a supplier's payment:
//   advance        loan/advance paid to the supplier, recovered from this month
//   transport      lorry charge override (factory default is in payment_settings)
//   water_penalty  cut for watered/wet leaf — percent of the period's leaf value,
//                  or a flat amount; an explicit, evidence-based deduction
//   other          fertilizer credit, sack charge, misc (label + amount)
//   bonus          one-off positive addition at the owner's discretion
//
// Exactly one of `amount` (flat LKR) or `percent` is set. Percent-based rows
// (typically water_penalty) are resolved against the period's leaf+bonus value
// at generation time and snapshotted into payment_lines. Sign is implied by
// kind: bonus adds, everything else deducts.
export const supplierAdjustments = pgTable(
  "supplier_adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    kind: text("kind", {
      enum: ["advance", "transport", "water_penalty", "other", "bonus"],
    }).notNull(),
    label: text("label"),
    amount: numeric("amount", { precision: 12, scale: 2 }), // flat LKR (magnitude)
    percent: numeric("percent", { precision: 5, scale: 2 }), // % of period leaf value
    occurredOn: date("occurred_on").notNull(),
    // optional pin to a payment period; when null, derived from occurred_on
    periodYear: integer("period_year"),
    periodMonth: integer("period_month"),
    // ON DELETE SET NULL: keep the adjustment if its author is removed (0008).
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_supplier_adjustments_factory").on(t.factoryId),
    index("idx_supplier_adjustments_supplier").on(t.supplierId),
  ],
);
