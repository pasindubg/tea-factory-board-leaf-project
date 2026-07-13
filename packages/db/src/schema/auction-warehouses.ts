import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { factories } from "./factories";

// Factory-owned warehouse list used when forming physical bundled dispatches.
// Inactive warehouses remain visible as historical locations but cannot be used
// to create another dispatch.
export const auctionWarehouses = pgTable(
  "auction_warehouses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_auction_warehouses_factory").on(t.factoryId),
    uniqueIndex("uq_auction_warehouses_factory_name").on(t.factoryId, t.name),
  ],
);
