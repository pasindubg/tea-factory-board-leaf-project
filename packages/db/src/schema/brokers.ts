import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";

// Auction broker (the house that catalogues, values, sells & settles on the
// factory's behalf — e.g. BPML Produce Marketing). Registry, owner-managed.
export const brokers = pgTable(
  "brokers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    name: text("name").notNull(),
    vatNo: text("vat_no"),
    address: text("address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_brokers_factory").on(t.factoryId)],
);
