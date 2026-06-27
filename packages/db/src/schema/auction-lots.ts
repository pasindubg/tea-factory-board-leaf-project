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
    lotNo: text("lot_no"), // broker catalogue no, e.g. 0477 — null until catalogued
    grade: text("grade").notNull(),
    bags: integer("bags"),
    kgPerBag: numeric("kg_per_bag", { precision: 8, scale: 2 }),
    grossWt: numeric("gross_wt", { precision: 10, scale: 2 }),
    sampleAllowance: numeric("sample_allowance", { precision: 8, scale: 2 }),
    netWt: numeric("net_wt", { precision: 10, scale: 2 }).notNull(),
    store: text("store"),
    category: text("category"),
    state: text("state", {
      enum: ["invoiced", "catalogued", "shutout", "valued", "sold", "withdrawn", "settled"],
    })
      .default("invoiced")
      .notNull(),
    shutoutReason: text("shutout_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_auction_lots_factory").on(t.factoryId),
    index("idx_auction_lots_sale").on(t.saleId),
  ],
);
