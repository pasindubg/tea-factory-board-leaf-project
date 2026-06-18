import { pgTable, uuid, text, numeric, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";

// Quality-tier definitions per factory ("superleaf"). A tier adds a per-kg
// bonus on top of the base green-leaf rate (price_rates, grade GREEN_LEAF).
// Always framed as a bonus, never a deduction — see docs/PRODUCT.md. The base
// "Standard" tier typically has bonus_value 0. Owner-editable settings.
export const qualityTiers = pgTable(
  "quality_tiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    name: text("name").notNull(), // "Standard", "Superleaf", "Premium"
    // flat = LKR per kg; percent = % of the base rate per kg
    bonusKind: text("bonus_kind", { enum: ["flat", "percent"] }).notNull(),
    bonusValue: numeric("bonus_value", { precision: 10, scale: 2 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(), // higher = better tier
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_quality_tiers_factory").on(t.factoryId)],
);
