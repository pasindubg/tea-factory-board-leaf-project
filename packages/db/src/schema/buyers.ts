import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";

// Auction buyer (exporter/trader), e.g. INTER TEA (PVT) LTD. Registry, resolved
// by name when ingesting the sellers contract.
export const buyers = pgTable(
  "buyers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    name: text("name").notNull(),
    vatNo: text("vat_no"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_buyers_factory").on(t.factoryId),
    uniqueIndex("uq_buyers_factory_name").on(t.factoryId, t.name),
  ],
);
