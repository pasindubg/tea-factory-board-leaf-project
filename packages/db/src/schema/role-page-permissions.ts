import { boolean, index, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { accessRoles } from "./access-roles";
import { factories } from "./factories";

/** One explicit view/CRUD policy for a role on an application page. */
export const rolePagePermissions = pgTable(
  "role_page_permissions",
  {
    roleId: uuid("role_id")
      .references(() => accessRoles.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => factories.id, { onDelete: "cascade" })
      .notNull(),
    pageKey: text("page_key").notNull(),
    canView: boolean("can_view").default(false).notNull(),
    canCreate: boolean("can_create").default(false).notNull(),
    canUpdate: boolean("can_update").default(false).notNull(),
    canDelete: boolean("can_delete").default(false).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.pageKey] }),
    index("idx_role_page_permissions_factory").on(t.factoryId),
  ],
);
