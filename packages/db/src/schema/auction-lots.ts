import { pgTable, uuid, text, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { auctionSales } from "./auction-sales";
import { marks } from "./marks";

// A lot offered in an auction sale — the spine of the auction flow. Each
// broker document advances its `state`. `grade` is free-form broker-catalogue
// text (OP, OP1, OPA, PEK, PEK1, BM, …) — not the teaGrade enum, which is the
// factory's own intake/production grade set. `net_wt = gross_wt - sample_allowance`.
export const auctionLots = pgTable(
  "auction_lots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    saleId: uuid("sale_id")
      .references(() => auctionSales.id)
      .notNull(),
    markId: uuid("mark_id").references(() => marks.id),
    invoiceNo: text("invoice_no").notNull(), // factory ref, e.g. 0058
    // A lot keeps its physical Broker Invoice parent in sale_id. Its expected
    // auction sale is provisional until a broker valuation confirms the final
    // sale independently for this specific invoice.
    provisionalSaleNo: text("provisional_sale_no"),
    finalSaleNo: text("final_sale_no"),
    lotNo: text("lot_no"), // broker catalogue no, e.g. 0477 — null until catalogued
    grade: text("grade").notNull(),
    bags: integer("bags"),
    kgPerBag: numeric("kg_per_bag", { precision: 8, scale: 2 }),
    grossWt: numeric("gross_wt", { precision: 10, scale: 2 }),
    sampleAllowance: numeric("sample_allowance", { precision: 8, scale: 2 }),
    netWt: numeric("net_wt", { precision: 10, scale: 2 }).notNull(),
    store: text("store"),
    category: text("category"),
    // Where this row originated. `factory` = entered from factory invoice data;
    // `acknowledgement` = broker acknowledgement contained a lot that was not
    // in the factory-entered dispatch.
    lotSource: text("lot_source", { enum: ["factory", "acknowledgement"] })
      .default("factory")
      .notNull(),
    // Lifecycle: invoiced → acknowledged | pending | shutout → valued → sold |
    // re-print | withdrawn → settled. `pending` = invoiced but absent from the
    // current (partial) acknowledgement, may roll to a later sale.
    // `re-print` = unsold, re-sampled, rolled to the next sale.
    state: text("state", {
      enum: [
        "invoiced",
        "acknowledged",
        "pending",
        "missing", // explicit human decision: expected & overdue, no catalogue counterpart
        "shutout",
        "not-valued",
        "valued",
        "sold",
        "re-print",
        "withdrawn",
        "settled",
      ],
    })
      .default("invoiced")
      .notNull(),
    shutoutReason: text("shutout_reason"),
    reprintSourceLotId: uuid("reprint_source_lot_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_auction_lots_factory").on(t.factoryId),
    index("idx_auction_lots_sale").on(t.saleId),
    index("idx_auction_lots_factory_provisional_sale").on(t.factoryId, t.provisionalSaleNo),
    index("idx_auction_lots_factory_final_sale").on(t.factoryId, t.finalSaleNo),
  ],
);
