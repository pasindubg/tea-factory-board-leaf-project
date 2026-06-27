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
    saleNo: text("sale_no").notNull(), // e.g. 2026-023
    saleDate: date("sale_date"),
    promptDate: date("prompt_date"), // filled from the contract (A3)
    status: text("status", {
      enum: ["draft", "catalogued", "valued", "sold", "settled"],
    })
      .default("draft")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_auction_sales_factory").on(t.factoryId),
    uniqueIndex("uq_auction_sales_factory_broker_no").on(t.factoryId, t.brokerId, t.saleNo),
  ],
);
