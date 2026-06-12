import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { users } from "./users";

export const collectors = pgTable(
  "collectors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    userId: uuid("user_id").references(() => users.id), // nullable: some collectors aren't app users
    name: text("name").notNull(),
    phone: text("phone"),
    nicNumber: text("nic_number"),
    area: text("area"),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_collectors_factory").on(t.factoryId)],
);
