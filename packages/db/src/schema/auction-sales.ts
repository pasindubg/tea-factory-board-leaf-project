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
    saleNo: text("sale_no").notNull(), // dispatch number, e.g. DSP-001
    dispatchDate: date("dispatch_date").notNull().default("now()"), // when dispatched physically
    targetSaleNo: text("target_sale_no"), // the auction sale this dispatch targets (e.g. 2026-023)
    saleDate: date("sale_date"), // auction date (~3 weeks after dispatch)
    promptDate: date("prompt_date"), // settlement prompt date, filled from the contract (A3)
    // Dispatch-first: a sale starts as `dispatched` (lots sent to the store, no
    // ack yet) and is populated with sale details only after the broker documents
    // arrive. `draft` is retained for back-compat with pre-redesign rows.
    status: text("status", {
      enum: ["dispatched", "draft", "catalogued", "valued", "sold", "settled"],
    })
      .default("dispatched")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_auction_sales_factory").on(t.factoryId),
    uniqueIndex("uq_auction_sales_factory_broker_no").on(t.factoryId, t.brokerId, t.saleNo),
  ],
);
