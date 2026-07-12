import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { auctionGrades } from "./auction-grades";

// Broker documents can spell the same factory grade differently. Aliases map
// those broker spellings back to one canonical factory grade.
export const auctionGradeAliases = pgTable(
  "auction_grade_aliases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    gradeId: uuid("grade_id")
      .references(() => auctionGrades.id, { onDelete: "cascade" })
      .notNull(),
    alias: text("alias").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_auction_grade_aliases_factory").on(t.factoryId),
    index("idx_auction_grade_aliases_grade").on(t.gradeId),
    uniqueIndex("uq_auction_grade_aliases_factory_alias").on(t.factoryId, t.alias),
  ],
);
