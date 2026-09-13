import { pgTable, uuid, text, boolean, timestamp, index, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { vehicles } from "./vehicles";

// A collection route: the van run a driver makes to visit customers.
export const lines = pgTable(
  "lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    lineNo: text("line_no").notNull(),
    name: text("name"),
    vehicleId: uuid("vehicle_id"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_lines_factory").on(t.factoryId),
    uniqueIndex("uq_lines_factory_no").on(t.factoryId, t.lineNo),
    uniqueIndex("uq_lines_factory_id").on(t.factoryId, t.id),
    foreignKey({
      columns: [t.factoryId, t.vehicleId],
      foreignColumns: [vehicles.factoryId, vehicles.id],
      name: "fk_lines_vehicle",
    }),
  ],
);
