import { pgTable, uuid, text, boolean, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { collectors } from "./collectors";

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    collectorId: uuid("collector_id").references(() => collectors.id),
    name: text("name").notNull(),
    phone: text("phone"),
    nicNumber: text("nic_number"),
    landSizeAcres: numeric("land_size_acres", { precision: 8, scale: 2 }),
    area: text("area"),
    // Map location captured at registration in the field app (issue #13);
    // feeds driver route ordering (FA5). Optional until then.
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_suppliers_factory").on(t.factoryId)],
);
