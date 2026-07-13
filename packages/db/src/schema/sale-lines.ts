import { pgTable, uuid, numeric, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { auctionSales } from "./auction-sales";
import { auctionLots } from "./auction-lots";
import { buyers } from "./buyers";

// The actual auction sale of a lot (from the Sellers Contract & Account Sales):
// buyer, price/kg, proceeds, VAT, and whether VAT is deferred on a bank guarantee
// (on_guarantee = the contract's "Bank Guarantee: YES"). One per lot. Feeds
// reconciliation ② (vs valuation) and ③ (VAT split, in A3).
export const saleLines = pgTable(
  "sale_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    saleId: uuid("sale_id")
      .references(() => auctionSales.id)
      .notNull(),
    lotId: uuid("lot_id")
      .references(() => auctionLots.id)
      .notNull(),
    buyerId: uuid("buyer_id").references(() => buyers.id),
    grossWt: numeric("gross_wt", { precision: 10, scale: 2 }),
    sampleAllowance: numeric("sample_allowance", { precision: 8, scale: 2 }),
    netWt: numeric("net_wt", { precision: 10, scale: 2 }).notNull(),
    pricePerKg: numeric("price_per_kg", { precision: 12, scale: 2 }).notNull(),
    proceeds: numeric("proceeds", { precision: 14, scale: 2 }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).notNull(),
    onGuarantee: boolean("on_guarantee").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_sale_lines_factory").on(t.factoryId),
    index("idx_sale_lines_sale").on(t.saleId),
    uniqueIndex("uq_sale_lines_lot").on(t.lotId),
  ],
);
