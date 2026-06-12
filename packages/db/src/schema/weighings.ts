import { pgTable, uuid, text, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { collectors } from "./collectors";
import { suppliers } from "./suppliers";
import { lots } from "./lots";
import { teaGrade } from "./enums";

// Core entity — created offline on mobile, synced to server
export const weighings = pgTable(
  "weighings",
  {
    id: uuid("id").primaryKey(), // UUID generated client-side for offline support
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    collectorId: uuid("collector_id")
      .references(() => collectors.id)
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    lotId: uuid("lot_id").references(() => lots.id),
    weightKg: numeric("weight_kg", { precision: 8, scale: 2 }).notNull(),
    grade: teaGrade("grade").notNull().default("GREEN_LEAF"),
    collectedAt: timestamp("collected_at").notNull(), // actual collection time (set on device)
    syncedAt: timestamp("synced_at"), // null until pushed to server
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_weighings_factory").on(t.factoryId),
    index("idx_weighings_supplier").on(t.supplierId),
    index("idx_weighings_collected_at").on(t.collectedAt),
  ],
);
