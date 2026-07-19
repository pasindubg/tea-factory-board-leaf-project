import { pgTable, uuid, numeric, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { auctionLots } from "./auction-lots";

// Broker's pre-sale valuation of an auction lot: a price-per-kg range (min == max
// when a point estimate), projected proceeds (low-end × net wt), and a tasting
// note. One per lot. Feeds reconciliation ② (docs/AUCTION.md §4②).
export const valuations = pgTable(
  "valuations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    lotId: uuid("lot_id")
      // A valuation has no meaning outside its one auction lot. Sale proceeds
      // and VAT are separate restrictive records and are not cascaded here.
      .references(() => auctionLots.id, { onDelete: "cascade" })
      .notNull(),
    priceMin: numeric("price_min", { precision: 10, scale: 2 }),
    priceMax: numeric("price_max", { precision: 10, scale: 2 }),
    projectedProceeds: numeric("projected_proceeds", { precision: 14, scale: 2 }),
    tastingNote: text("tasting_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_valuations_factory").on(t.factoryId),
    uniqueIndex("uq_valuations_lot").on(t.lotId),
  ],
);
