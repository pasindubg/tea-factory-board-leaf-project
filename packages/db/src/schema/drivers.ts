import { sql } from "drizzle-orm";
import { pgTable, uuid, text, boolean, timestamp, index, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { users } from "./users";

export const drivers = pgTable(
  "drivers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    // A driver stays an operational registry row when its login is removed.
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    phone: text("phone"),
    nicNumber: text("nic_number"),
    licenceNo: text("licence_no"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_drivers_factory").on(t.factoryId),
    uniqueIndex("uq_drivers_factory_id").on(t.factoryId, t.id),
    uniqueIndex("uq_drivers_factory_user").on(t.factoryId, t.userId).where(sql`${t.userId} IS NOT NULL`),
    // 0083 makes this NO ACTION check DEFERRABLE INITIALLY DEFERRED, so the
    // single-column ON DELETE SET NULL can preserve this row before checking it.
    foreignKey({ name: "fk_drivers_user_factory", columns: [t.factoryId, t.userId], foreignColumns: [users.factoryId, users.id] }),
  ],
);
