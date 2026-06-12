import { pgTable, uuid, text, timestamp, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { teaGrade } from "./enums";

export const lots = pgTable(
  "lots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    lotNumber: text("lot_number").notNull(),
    grade: teaGrade("grade").notNull(),
    date: date("date").notNull(),
    status: text("status", { enum: ["open", "processing", "graded", "sold"] }).default("open"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_lots_factory").on(t.factoryId),
    uniqueIndex("uq_lots_factory_lot_number").on(t.factoryId, t.lotNumber),
  ],
);
