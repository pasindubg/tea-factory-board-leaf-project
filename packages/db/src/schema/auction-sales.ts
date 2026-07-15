import { sql } from "drizzle-orm";
import { pgTable, uuid, text, date, timestamp, index, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { brokers } from "./brokers";
import { marks } from "./marks";
import { auctionBundledDispatches } from "./auction-bundled-dispatches";

// An auction sale event (e.g. Sale 2026-023 at BPML). One row per (broker,
// sale_no); lots under multiple marks hang off it. Named to sit alongside the
// existing production `lots` table without collision (see docs/AUCTION.md §5).
export const auctionSales = pgTable(
  "auction_sales",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    brokerId: uuid("broker_id")
      .references(() => brokers.id)
      .notNull(),
    // One Broker Invoice represents one selling mark carried by one broker
    // vehicle in a physical bundled dispatch.
    sellingMarkId: uuid("selling_mark_id").references(() => marks.id),
    brokerLorryNo: text("broker_lorry_no"),
    driverName: text("driver_name"),
    bundledDispatchId: uuid("bundled_dispatch_id").references(() => auctionBundledDispatches.id, { onDelete: "set null" }),
    saleKind: text("sale_kind", { enum: ["dispatch", "reprint"] })
      .default("dispatch")
      .notNull(),
    // Re-print invoice headers are operational children of their original
    // Broker Invoice. Financial rows under either invoice remain restrictive.
    parentSaleId: uuid("parent_sale_id").references(
      (): AnyPgColumn => auctionSales.id,
      { onDelete: "cascade" },
    ),
    reprintNo: text("reprint_no"),
    saleNo: text("sale_no").notNull(), // broker invoice number, e.g. 0001
    dispatchDate: date("dispatch_date").notNull().default("now()"), // broker invoice date (physical dispatch date)
    targetSaleNo: text("target_sale_no"), // the auction sale this broker invoice targets (e.g. 2026-023)
    saleDate: date("sale_date"), // auction date (~3 weeks after dispatch)
    promptDate: date("prompt_date"), // settlement prompt date, filled from the contract (A3)
    // A broker invoice starts as a draft. Once confirmed it is invoiced; the
    // later statuses are driven by the broker documents and settlement flow.
    status: text("status", {
      enum: ["dispatched", "draft", "invoiced", "grn", "catalogued", "valued", "sold", "settled", "broker_statement"],
    })
      .default("draft")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Immutable server date derived from the database-created timestamp in the
    // factory's Asia/Colombo calendar. It is never accepted from a user form.
    createdDate: date("created_date")
      .notNull()
      .generatedAlwaysAs(sql`("created_at" at time zone 'UTC' at time zone 'Asia/Colombo')::date`),
  },
  (t) => [
    index("idx_auction_sales_factory").on(t.factoryId),
    index("idx_auction_sales_parent_sale").on(t.parentSaleId),
    index("idx_auction_sales_bundled_dispatch").on(t.bundledDispatchId),
    uniqueIndex("uq_auction_sales_factory_broker_no").on(t.factoryId, t.brokerId, t.saleNo),
    uniqueIndex("uq_auction_sales_factory_parent_reprint_no").on(t.factoryId, t.parentSaleId, t.reprintNo),
    // PostgreSQL treats nulls as distinct, so historic invoices without these
    // new attributes remain valid while all new, fully-specified invoices are
    // protected from a duplicate broker + selling mark in one bundle.
    uniqueIndex("uq_auction_sales_bundle_broker_mark").on(t.factoryId, t.bundledDispatchId, t.brokerId, t.sellingMarkId),
  ],
);
