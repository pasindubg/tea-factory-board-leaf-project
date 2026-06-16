import { pgTable, uuid, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { factories } from "./factories";

// One row per factory: payment knobs the owner controls. The base green-leaf
// rate lives in price_rates (effective-dated); these are the deduction defaults.
// transport_per_kg = 0 means no automatic transport deduction.
//
// The water penalty is uniform across suppliers: the owner picks a mode
// (per_kg = flat LKR/kg, or percent = % of that delivery's leaf value) and a
// single value. At the weighbridge the recorder just ticks "leaf is wet" on a
// weighing; the penalty is computed per wet delivery at payment time.
export const paymentSettings = pgTable("payment_settings", {
  factoryId: uuid("factory_id")
    .references(() => factories.id)
    .primaryKey(),
  transportPerKg: numeric("transport_per_kg", { precision: 10, scale: 2 }).default("0").notNull(),
  waterPenaltyMode: text("water_penalty_mode", { enum: ["per_kg", "percent"] })
    .default("percent")
    .notNull(),
  waterPenaltyPerKg: numeric("water_penalty_per_kg", { precision: 10, scale: 2 }).default("0").notNull(),
  defaultWaterPenaltyPct: numeric("default_water_penalty_pct", { precision: 5, scale: 2 })
    .default("0")
    .notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
