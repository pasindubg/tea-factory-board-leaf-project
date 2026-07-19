import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { factories } from "./factories";

/**
 * A named factory role. `baseRole` deliberately remains one of the existing
 * application roles: it is the maximum privilege recognised by the database
 * RLS policies. Page permissions can only narrow that baseline.
 */
export const accessRoles = pgTable(
  "access_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id, { onDelete: "cascade" })
      .notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    baseRole: text("base_role", {
      enum: ["owner", "manager", "supervisor", "accountant", "collector", "supplier", "driver"],
    }).notNull(),
    systemRole: boolean("system_role").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("access_roles_factory_key_unique").on(t.factoryId, t.key),
    uniqueIndex("access_roles_factory_name_unique").on(t.factoryId, t.name),
    index("idx_access_roles_factory").on(t.factoryId),
  ],
);
