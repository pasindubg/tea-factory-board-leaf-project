import { pgTable, uuid, text, boolean, timestamp, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    vehicleNo: text("vehicle_no").notNull(),
    makeModel: text("make_model"),
    capacityKg: numeric("capacity_kg", { precision: 10, scale: 2 }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_vehicles_factory").on(t.factoryId),
    uniqueIndex("uq_vehicles_factory_no").on(t.factoryId, t.vehicleNo),
    // Target for tenant-pinned composite foreign keys.
    uniqueIndex("uq_vehicles_factory_id").on(t.factoryId, t.id),
  ],
);
