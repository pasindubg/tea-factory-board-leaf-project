import { pgTable, uuid, text, numeric, date, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { auctionSales } from "./auction-sales";

// Per-contract settlement (Account Sales) — one row per (sale, contract_no).
// Holds the broker's deduction summary and the final Total Net Proceeds due.
// Feeds VAT ledger and bank reconciliation (docs/AUCTION.md §5, §7).
export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    saleId: uuid("sale_id")
      .references(() => auctionSales.id)
      .notNull(),
    contractNo: text("contract_no").notNull(), // e.g. 2026/023/0110
    proceedsTotal: numeric("proceeds_total", { precision: 14, scale: 2 }).notNull(),
    totalDeductions: numeric("total_deductions", { precision: 14, scale: 2 }).notNull(),
    netProceeds: numeric("net_proceeds", { precision: 14, scale: 2 }).notNull(),
    outputVat: numeric("output_vat", { precision: 14, scale: 2 }).notNull(),
    totalNetProceeds: numeric("total_net_proceeds", { precision: 14, scale: 2 }).notNull(),
    promptDate: date("prompt_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_settlements_factory").on(t.factoryId),
    index("idx_settlements_sale").on(t.saleId),
    uniqueIndex("uq_settlements_contract").on(t.factoryId, t.contractNo),
  ],
);
