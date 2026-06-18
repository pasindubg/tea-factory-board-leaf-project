import { pgTable, uuid, text, primaryKey } from "drizzle-orm/pg-core";
import { factories } from "./factories";

export const modulePermissions = pgTable(
  "module_permissions",
  {
    factoryId: uuid("factory_id")
      .references(() => factories.id, { onDelete: "cascade" })
      .notNull(),
    moduleKey: text("module_key").notNull(),
    allowedRoles: text("allowed_roles").array().notNull(),
  },
  (t) => [primaryKey({ columns: [t.factoryId, t.moduleKey] })],
);
