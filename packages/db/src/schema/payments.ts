import { pgTable, uuid, text, timestamp, numeric, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { suppliers } from "./suppliers";

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(), // 1-12
    totalKg: numeric("total_kg", { precision: 12, scale: 2 }).notNull(),
    // Breakdown (payment_lines holds the itemized detail).
    //   gross = leaf payment + tier bonus; total_amount (net) = gross − deductions
    grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }).default("0").notNull(),
    bonusAmount: numeric("bonus_amount", { precision: 14, scale: 2 }).default("0").notNull(),
    // what the top tier would have added — the motivational "bonus missed" figure
    bonusMissed: numeric("bonus_missed", { precision: 14, scale: 2 }).default("0").notNull(),
    deductionAmount: numeric("deduction_amount", { precision: 14, scale: 2 }).default("0").notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(), // net LKR payable
    status: text("status", { enum: ["pending", "paid"] }).default("pending"),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_payments_factory").on(t.factoryId),
    // one payment per supplier per month
    uniqueIndex("uq_payments_supplier_period").on(t.supplierId, t.periodYear, t.periodMonth),
  ],
);
