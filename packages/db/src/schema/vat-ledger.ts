import { pgTable, uuid, text, numeric, boolean, date, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { saleLines } from "./sale-lines";

// Per-sale-line VAT tracking (docs/AUCTION.md §5, §4③).
// Each sale line produces one ledger row. flow = 'auction_output' for
// proceeds VAT collected from the buyer on the seller's behalf;
// mode = cash (up-front) | guarantee (deferred, secured by bank
// guarantee). Future flows (auction_input, supplier_vat) will use
// different flow values — the tag is the seam.
export const vatLedger = pgTable(
  "vat_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    saleLineId: uuid("sale_line_id")
      .references(() => saleLines.id)
      .notNull(),
    flow: text("flow", { enum: ["auction_output", "auction_input"] }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).notNull(),
    mode: text("mode", { enum: ["cash", "guarantee"] }).notNull(),
    guaranteeDueDate: date("guarantee_due_date"),
    realisedDate: date("realised_date"), // null until bank credit matched (recon ④)
    status: text("status", { enum: ["pending", "received", "remitted"] })
      .default("pending")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_vat_ledger_factory").on(t.factoryId),
    index("idx_vat_ledger_sale_line").on(t.saleLineId),
  ],
);
