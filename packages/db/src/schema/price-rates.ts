import { pgTable, uuid, timestamp, numeric, date, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { teaGrade } from "./enums";

export const priceRates = pgTable(
  "price_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    grade: teaGrade("grade").notNull(),
    pricePerKg: numeric("price_per_kg", { precision: 10, scale: 2 }).notNull(), // LKR
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"), // null = currently active
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_price_rates_factory").on(t.factoryId)],
);
