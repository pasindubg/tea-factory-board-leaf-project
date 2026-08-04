import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { users } from "./users";

/**
 * A user's own saved search criteria for one list instance (identified by its
 * framework `scope` key), restored automatically on every session. Purely
 * personal — see `list_search_locks` for owner/manager-managed permanent
 * overrides.
 */
export const listSearchStates = pgTable(
  "list_search_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    listScope: text("list_scope").notNull(),
    criteria: jsonb("criteria").$type<Record<string, string>>().default({}).notNull(),
    advancedQuery: text("advanced_query"),
    sortKey: text("sort_key"),
    sortDir: text("sort_dir", { enum: ["asc", "desc"] }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("list_search_states_user_scope_unique").on(t.userId, t.listScope),
    index("idx_list_search_states_factory").on(t.factoryId),
  ],
);
