import { boolean, index, numeric, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { brokers } from "./brokers";
import { auctionGrades } from "./auction-grades";

// Per-broker, per-grade dispatch rule. When applies=true, a factory-entered lot
// below min_net_kg is immediately marked shutout at entry/edit time.
export const brokerGradeThresholds = pgTable(
  "broker_grade_thresholds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    brokerId: uuid("broker_id")
      .references(() => brokers.id, { onDelete: "cascade" })
      .notNull(),
    gradeId: uuid("grade_id")
      .references(() => auctionGrades.id, { onDelete: "cascade" })
      .notNull(),
    minNetKg: numeric("min_net_kg", { precision: 10, scale: 2 }).default("0").notNull(),
    applies: boolean("applies").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_broker_grade_thresholds_factory").on(t.factoryId),
    index("idx_broker_grade_thresholds_broker").on(t.brokerId),
    uniqueIndex("uq_broker_grade_thresholds_factory_broker_grade").on(t.factoryId, t.brokerId, t.gradeId),
  ],
);
