import { pgTable, uuid, timestamp, index, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { lines } from "./lines";
import { drivers } from "./drivers";

export const lineDrivers = pgTable(
  "line_drivers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    lineId: uuid("line_id").notNull(),
    driverId: uuid("driver_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_line_drivers_factory").on(t.factoryId),
    index("idx_line_drivers_line").on(t.lineId),
    index("idx_line_drivers_driver").on(t.driverId),
    uniqueIndex("uq_line_drivers_line_driver").on(t.lineId, t.driverId),
    foreignKey({
      columns: [t.factoryId, t.lineId],
      foreignColumns: [lines.factoryId, lines.id],
      name: "fk_line_drivers_line",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.factoryId, t.driverId],
      foreignColumns: [drivers.factoryId, drivers.id],
      name: "fk_line_drivers_driver",
    }).onDelete("cascade"),
  ],
);
