import { pgTable, uuid, numeric, timestamp } from "drizzle-orm/pg-core";
import { factories } from "./factories";

// One row per factory: payment knobs the owner controls. The base green-leaf
// rate lives in price_rates (effective-dated); these are the deduction defaults.
// transport_per_kg = 0 means no automatic transport deduction. The water
// penalty default is only a UI prefill — it is never auto-applied to every
// supplier; a penalty applies only when the owner adds a water_penalty
// adjustment for a specific supplier (see supplier_adjustments).
export const paymentSettings = pgTable("payment_settings", {
  factoryId: uuid("factory_id")
    .references(() => factories.id)
    .primaryKey(),
  transportPerKg: numeric("transport_per_kg", { precision: 10, scale: 2 }).default("0").notNull(),
  defaultWaterPenaltyPct: numeric("default_water_penalty_pct", { precision: 5, scale: 2 })
    .default("0")
    .notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
