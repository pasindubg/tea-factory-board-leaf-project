import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { factories } from "./factories";

// Factory-owned tea grade registry for auction dispatch entry. Broker catalogue
// grades vary, so this remains text/code based and customer-editable.
export const auctionGrades = pgTable(
  "auction_grades",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_auction_grades_factory").on(t.factoryId),
    uniqueIndex("uq_auction_grades_factory_code").on(t.factoryId, t.code),
  ],
);
