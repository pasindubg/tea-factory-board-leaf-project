import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { auctionLots } from "./auction-lots";

// Invoice numbers attached to an auction lot. A lot usually maps to a single
// invoice (the common case = one row), but rarely a lot carries several invoices
// — so the (lot, invoice_no) pairing lives here as the source of truth. The lot
// keeps a denormalized primary `invoice_no` for convenience; this table is what
// reconciliation keys against. See docs/AUCTION.md §5 and the dispatch-first model.
export const lotInvoices = pgTable(
  "lot_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    lotId: uuid("lot_id")
      .references(() => auctionLots.id, { onDelete: "cascade" })
      .notNull(),
    invoiceNo: text("invoice_no").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_lot_invoices_factory").on(t.factoryId),
    index("idx_lot_invoices_lot").on(t.lotId),
    uniqueIndex("uq_lot_invoices_lot_invoice").on(t.lotId, t.invoiceNo),
  ],
);
