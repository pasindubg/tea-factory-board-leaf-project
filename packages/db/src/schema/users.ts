import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";

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
    role: text("role", { enum: ["owner", "manager", "collector"] }).notNull(),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_users_factory").on(t.factoryId)],
);
