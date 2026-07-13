import { pgTable, uuid, text, date, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { brokers } from "./brokers";

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
    saleKind: text("sale_kind", { enum: ["dispatch", "reprint"] })
      .default("dispatch")
      .notNull(),
    parentSaleId: uuid("parent_sale_id"),
    reprintNo: text("reprint_no"),
    saleNo: text("sale_no").notNull(), // broker invoice number, e.g. 0001
    dispatchDate: date("dispatch_date").notNull().default("now()"), // broker invoice date (physical dispatch date)
    targetSaleNo: text("target_sale_no"), // the auction sale this broker invoice targets (e.g. 2026-023)
    saleDate: date("sale_date"), // auction date (~3 weeks after dispatch)
    promptDate: date("prompt_date"), // settlement prompt date, filled from the contract (A3)
    // A broker invoice starts as a draft. Once confirmed it is invoiced; the
    // later statuses are driven by the broker documents and settlement flow.
    status: text("status", {
      enum: ["dispatched", "draft", "invoiced", "catalogued", "valued", "sold", "settled", "broker_statement"],
    })
      .default("draft")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_auction_sales_factory").on(t.factoryId),
    index("idx_auction_sales_parent_sale").on(t.parentSaleId),
    uniqueIndex("uq_auction_sales_factory_broker_no").on(t.factoryId, t.brokerId, t.saleNo),
    uniqueIndex("uq_auction_sales_factory_parent_reprint_no").on(t.factoryId, t.parentSaleId, t.reprintNo),
  ],
);
