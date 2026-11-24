import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { factories } from "./factories";
import { users } from "./users";
import { auctionLots } from "./auction-lots";
import { auctionBundledDispatches } from "./auction-bundled-dispatches";

export const auctionDispatchLotChecks = pgTable("auction_dispatch_lot_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  factoryId: uuid("factory_id").references(() => factories.id).notNull(),
  dispatchId: uuid("dispatch_id").notNull(),
  lotId: uuid("lot_id").notNull(),
  grade: text("grade").notNull(),
  expectedBags: integer("expected_bags").notNull(),
  targetGrams: integer("target_grams").notNull(),
  underToleranceGrams: integer("under_tolerance_grams").notNull(),
  overToleranceGrams: integer("over_tolerance_grams").notNull(),
  policyVersion: integer("policy_version").default(1).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (t) => [
  uniqueIndex("uq_auction_dispatch_checks_factory_id").on(t.factoryId, t.id),
  uniqueIndex("uq_auction_dispatch_checks_dispatch_lot").on(t.factoryId, t.dispatchId, t.lotId),
  index("idx_auction_dispatch_checks_factory_dispatch").on(t.factoryId, t.dispatchId),
  foreignKey({ columns: [t.factoryId, t.dispatchId], foreignColumns: [auctionBundledDispatches.factoryId, auctionBundledDispatches.id], name: "fk_dispatch_checks_dispatch" }),
  foreignKey({ columns: [t.factoryId, t.lotId], foreignColumns: [auctionLots.factoryId, auctionLots.id], name: "fk_dispatch_checks_lot" }),
  check("dispatch_check_values", sql`${t.expectedBags} > 0 AND ${t.targetGrams} > 0 AND ${t.underToleranceGrams} >= 0 AND ${t.underToleranceGrams} < ${t.targetGrams} AND ${t.overToleranceGrams} >= 0 AND ${t.policyVersion} > 0`),
]);

export const auctionDispatchBags = pgTable("auction_dispatch_bags", {
  id: uuid("id").defaultRandom().primaryKey(),
  factoryId: uuid("factory_id").references(() => factories.id).notNull(),
  dispatchId: uuid("dispatch_id").notNull(),
  checkId: uuid("check_id").notNull(),
  bagNumber: integer("bag_number").notNull(),
  measuredGrams: integer("measured_grams"),
  deviceId: text("device_id"),
  loadId: uuid("load_id"),
  readingId: uuid("reading_id"),
  requestId: uuid("request_id"),
  confirmedBy: uuid("confirmed_by").references(() => users.id),
  confirmedAt: timestamp("confirmed_at"),
}, (t) => [
  uniqueIndex("uq_auction_dispatch_bags_factory_id").on(t.factoryId, t.id),
  uniqueIndex("uq_auction_dispatch_bags_check_number").on(t.factoryId, t.checkId, t.bagNumber),
  uniqueIndex("uq_auction_dispatch_bags_request").on(t.factoryId, t.requestId),
  uniqueIndex("uq_auction_dispatch_bags_load").on(t.factoryId, t.dispatchId, t.deviceId, t.loadId),
  index("idx_auction_dispatch_bags_factory_check").on(t.factoryId, t.checkId),
  foreignKey({ columns: [t.factoryId, t.checkId], foreignColumns: [auctionDispatchLotChecks.factoryId, auctionDispatchLotChecks.id], name: "fk_dispatch_bags_check" }),
  foreignKey({ columns: [t.factoryId, t.dispatchId], foreignColumns: [auctionBundledDispatches.factoryId, auctionBundledDispatches.id], name: "fk_dispatch_bags_dispatch" }),
  check("dispatch_bag_number_positive", sql`${t.bagNumber} > 0`),
  check("dispatch_bag_confirmation_complete", sql`(${t.confirmedAt} IS NULL AND ${t.measuredGrams} IS NULL AND ${t.deviceId} IS NULL AND ${t.loadId} IS NULL AND ${t.readingId} IS NULL AND ${t.requestId} IS NULL AND ${t.confirmedBy} IS NULL) OR (${t.confirmedAt} IS NOT NULL AND ${t.measuredGrams} > 0 AND ${t.deviceId} IS NOT NULL AND ${t.loadId} IS NOT NULL AND ${t.readingId} IS NOT NULL AND ${t.requestId} IS NOT NULL AND ${t.confirmedBy} IS NOT NULL)`),
]);

export const auctionDispatchBagEvents = pgTable("auction_dispatch_bag_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  factoryId: uuid("factory_id").references(() => factories.id).notNull(),
  dispatchId: uuid("dispatch_id").notNull(),
  checkId: uuid("check_id").notNull(),
  bagId: uuid("bag_id"),
  eventType: text("event_type", { enum: ["manifest_started", "bag_confirmed"] }).notNull(),
  actorId: uuid("actor_id").references(() => users.id).notNull(),
  detail: jsonb("detail").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_auction_dispatch_bag_events_factory_dispatch").on(t.factoryId, t.dispatchId),
  foreignKey({ columns: [t.factoryId, t.dispatchId], foreignColumns: [auctionBundledDispatches.factoryId, auctionBundledDispatches.id], name: "fk_dispatch_bag_events_dispatch" }),
  foreignKey({ columns: [t.factoryId, t.checkId], foreignColumns: [auctionDispatchLotChecks.factoryId, auctionDispatchLotChecks.id], name: "fk_dispatch_bag_events_check" }),
  foreignKey({ columns: [t.factoryId, t.bagId], foreignColumns: [auctionDispatchBags.factoryId, auctionDispatchBags.id], name: "fk_dispatch_bag_events_bag" }),
  check("dispatch_bag_event_type", sql`${t.eventType} IN ('manifest_started', 'bag_confirmed')`),
  check("dispatch_bag_event_bag_relation", sql`(${t.eventType} = 'manifest_started' AND ${t.bagId} IS NULL) OR (${t.eventType} = 'bag_confirmed' AND ${t.bagId} IS NOT NULL)`),
]);
