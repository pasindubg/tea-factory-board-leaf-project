import { pgTable, uuid, numeric, date, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { brokers } from "./brokers";

// Owner-editable, per-broker deduction rate card (effective-dated). The Account
// Sales math (docs/AUCTION.md §7) is computed from these — rates are configurable
// per broker, never hardcoded. Defaults shown are BPML's (Sale 2026-023).
export const brokerRates = pgTable(
  "broker_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    brokerId: uuid("broker_id")
      .references(() => brokers.id)
      .notNull(),
    effectiveFrom: date("effective_from").notNull(),
    insurancePerKg: numeric("insurance_per_kg", { precision: 10, scale: 4 }).default("0").notNull(),
    publicSaleExPerLot: numeric("public_sale_ex_per_lot", { precision: 10, scale: 2 }).default("0").notNull(),
    brokeragePct: numeric("brokerage_pct", { precision: 6, scale: 3 }).default("0").notNull(),
    handlingPerKg: numeric("handling_per_kg", { precision: 10, scale: 4 }).default("0").notNull(),
    documentationPerLot: numeric("documentation_per_lot", { precision: 10, scale: 2 }).default("0").notNull(),
    eplatformPerKg: numeric("eplatform_per_kg", { precision: 10, scale: 4 }).default("0").notNull(),
    govtReliefLoan: numeric("govt_relief_loan", { precision: 14, scale: 2 }).default("0").notNull(),
    chargesVatPct: numeric("charges_vat_pct", { precision: 6, scale: 3 }).default("18").notNull(),
    proceedsVatPct: numeric("proceeds_vat_pct", { precision: 6, scale: 3 }).default("18").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_broker_rates_factory_broker").on(t.factoryId, t.brokerId)],
);
