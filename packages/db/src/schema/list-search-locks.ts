import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accessRoles } from "./access-roles";
import { factories } from "./factories";
import { users } from "./users";

/**
 * A permanent, owner/manager-managed search-criteria lock for one list
 * instance, applied to either a base role or a specific custom access role.
 * Locks are enforced server-side (see `loadListResource`), not just hidden in
 * the UI — a locked field's value always wins over whatever the client sends.
 * owner/manager are exempt from locks entirely (checked in application code).
 */
export const listSearchLocks = pgTable(
  "list_search_locks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id, { onDelete: "cascade" })
      .notNull(),
    listScope: text("list_scope").notNull(),
    baseRole: text("base_role", {
      enum: ["owner", "manager", "supervisor", "accountant", "collector", "supplier", "driver"],
    }),
    accessRoleId: uuid("access_role_id").references(() => accessRoles.id, { onDelete: "cascade" }),
    criteria: jsonb("criteria").$type<Record<string, string>>().default({}).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    check(
      "list_search_locks_role_key_check",
      sql`(${t.baseRole} is not null) <> (${t.accessRoleId} is not null)`,
    ),
    uniqueIndex("list_search_locks_factory_scope_base_role_unique")
      .on(t.factoryId, t.listScope, t.baseRole)
      .where(sql`${t.baseRole} is not null`),
    uniqueIndex("list_search_locks_factory_scope_access_role_unique")
      .on(t.factoryId, t.listScope, t.accessRoleId)
      .where(sql`${t.accessRoleId} is not null`),
    index("idx_list_search_locks_factory").on(t.factoryId),
  ],
);
