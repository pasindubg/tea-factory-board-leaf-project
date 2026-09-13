import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  index,
  uniqueIndex,
  foreignKey,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { collectors } from "./collectors";
import { lines } from "./lines";
import { users } from "./users";

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    collectorId: uuid("collector_id").references(() => collectors.id),
    // The number this customer already carries in the factory's existing
    // system. Digits only — factories number their customer book plainly — but
    // text, so leading zeros survive verbatim.
    customerNo: text("customer_no").notNull(),
    lineId: uuid("line_id"),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    nicNumber: text("nic_number"),
    landSizeAcres: numeric("land_size_acres", { precision: 8, scale: 2 }),
    cultivatedAreaAcres: numeric("cultivated_area_acres", { precision: 8, scale: 2 }),
    area: text("area"),
    address: text("address"),
    // Map location captured at registration in the field app (issue #13);
    // feeds driver route ordering (FA5). Optional until then.
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
    locationAccuracyM: numeric("location_accuracy_m", { precision: 8, scale: 2 }),
    locationCapturedAt: timestamp("location_captured_at"),
    photoPath: text("photo_path"),
    bankBookPath: text("bank_book_path"),
    bankAccountNo: text("bank_account_no"),
    bankName: text("bank_name"),
    bankBranch: text("bank_branch"),
    // pending | parsed | confirmed | failed — OCR of bank_book_path is never
    // trusted for money until a person confirms it.
    bankParseStatus: text("bank_parse_status"),
    // AnyPgColumn breaks the users→suppliers→users type cycle.
    registeredByUserId: uuid("registered_by_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    registeredAt: timestamp("registered_at"),
    clientUuid: uuid("client_uuid"),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_suppliers_factory").on(t.factoryId),
    index("idx_suppliers_line").on(t.lineId),
    index("idx_suppliers_geo").on(t.latitude, t.longitude),
    uniqueIndex("uq_suppliers_factory_customer_no").on(t.factoryId, t.customerNo),
    check("suppliers_customer_no_check", sql`${t.customerNo} ~ '^[0-9]+$'`),
    check("suppliers_phone_check", sql`length(btrim(${t.phone})) > 0`),
    check("suppliers_latitude_check", sql`${t.latitude} BETWEEN -90 AND 90`),
    check("suppliers_longitude_check", sql`${t.longitude} BETWEEN -180 AND 180`),
    uniqueIndex("uq_suppliers_client_uuid")
      .on(t.clientUuid)
      .where(sql`"client_uuid" IS NOT NULL`),
    foreignKey({
      columns: [t.factoryId, t.lineId],
      foreignColumns: [lines.factoryId, lines.id],
      name: "fk_suppliers_line",
    }),
  ],
);
