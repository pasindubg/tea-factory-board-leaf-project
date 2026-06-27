import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";

// Estate mark — a selling identity the factory trades under at auction.
// A factory may have several (e.g. MF1530 KUMUDU, MF1530A ITTAPANA).
export const marks = pgTable(
  "marks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    code: text("code").notNull(), // e.g. MF1530
    name: text("name").notNull(), // e.g. KUMUDU
    address: text("address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_marks_factory").on(t.factoryId),
    uniqueIndex("uq_marks_factory_code").on(t.factoryId, t.code),
  ],
);
