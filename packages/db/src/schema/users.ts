import { pgTable, uuid, text, boolean, timestamp, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { suppliers } from "./suppliers";
import { accessRoles } from "./access-roles";

// `supplier` and `driver` are field-app roles (issue #13): they log in on
// mobile via phone OTP and have no web modules. `role` is a TS-only text enum,
// so adding them needs no column migration. A `supplier`-role login links to
// its `suppliers` row via `supplierId`; `current_supplier_id()` (migration
// 0006) resolves it for supplier-scoped RLS.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(), // matches Supabase auth.users.id
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    username: text("username"),
    role: text("role", {
      enum: ["owner", "manager", "supervisor", "accountant", "collector", "supplier", "driver"],
    }).notNull(),
    // The legacy/base role remains the database-RLS authority. This optional
    // named role carries the factory's configurable page/action permissions.
    accessRoleId: uuid("access_role_id").references(() => accessRoles.id, { onDelete: "set null" }),
    // AnyPgColumn annotation breaks the collectors→users→suppliers→collectors
    // type cycle this FK closes (Drizzle's documented circular-reference fix).
    supplierId: uuid("supplier_id").references((): AnyPgColumn => suppliers.id), // set for supplier-role logins
    active: boolean("active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_users_factory").on(t.factoryId), index("idx_users_access_role").on(t.accessRoleId)],
);
