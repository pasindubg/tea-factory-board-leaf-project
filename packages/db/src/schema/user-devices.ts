import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { users } from "./users";

// One active device per login: the field app generates a device id into secure
// storage and sends it on every request, and writes are refused from any other.
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
