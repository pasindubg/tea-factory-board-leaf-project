import { pgTable, uuid, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { auctionSales } from "./auction-sales";
import { auctionLots } from "./auction-lots";

// Every MANUAL reconciliation decision (link an orphan invoice to a catalogue
// lot, mark a lot shut out / pending / genuinely missing, reject a candidate) is
// recorded here. Financial reconciliation demands traceability: who decided what,
// when, with what confidence on screen, and any weight discrepancy filed so it
// isn't silently swallowed. See docs/AUCTION.md §4① and the orphan resolver.
export const auctionAudit = pgTable(
  "auction_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    saleId: uuid("sale_id").references(() => auctionSales.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id").references(() => auctionLots.id, { onDelete: "set null" }),
    action: text("action").notNull(), // e.g. "Linked", "Shutout", "Pending", "Missing", "Rejected"
    detail: text("detail").notNull(),
    reason: text("reason"),
    actor: text("actor").notNull(), // user id / display name who made the call
    confidenceShown: numeric("confidence_shown", { precision: 5, scale: 4 }), // 0..1, when a score was on screen
    weightDelta: numeric("weight_delta", { precision: 10, scale: 2 }), // ack.netWt − invoice.netWt, filed on a link
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_auction_audit_factory").on(t.factoryId),
    index("idx_auction_audit_sale").on(t.saleId),
  ],
);
