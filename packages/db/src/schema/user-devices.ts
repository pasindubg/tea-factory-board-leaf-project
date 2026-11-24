import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { users } from "./users";

// One active mobile session per field login. The phone and the Neon Auth
// session must both match before a field request can access protected records.
export const userDevices = pgTable(
  "user_devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    deviceId: text("device_id").notNull(),
    platform: text("platform"),
    model: text("model"),
    appVersion: text("app_version"),
    mobileSessionId: uuid("mobile_session_id"),
    lastSeenAt: timestamp("last_seen_at"),
    revokedAt: timestamp("revoked_at"),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_user_devices_factory").on(t.factoryId),
    index("idx_user_devices_user").on(t.userId),
    uniqueIndex("uq_user_devices_user_device").on(t.userId, t.deviceId),
    uniqueIndex("uq_user_devices_user_active")
      .on(t.userId)
      .where(sql`"revoked_at" IS NULL`),
  ],
);
