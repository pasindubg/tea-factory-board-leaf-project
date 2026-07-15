import { pgTable, uuid, text, numeric, date, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { settlements } from "./settlements";

// Bank statement rows imported from CSV. Each row is matched to a
// settlement (or left unmatched) by the bank reconciliation engine
// (docs/AUCTION.md §4④). The raw CSV line is preserved for auditing.
export const bankTransactions = pgTable(
  "bank_txns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    txnDate: date("txn_date").notNull(),
    description: text("description"),
    debit: numeric("debit", { precision: 14, scale: 2 }).default("0").notNull(),
    credit: numeric("credit", { precision: 14, scale: 2 }).default("0").notNull(),
    runningBalance: numeric("running_balance", { precision: 14, scale: 2 }),
    chequeNo: text("cheque_no"),
    rawLine: text("raw_line"), // original CSV row (delimiter-separated)
    importBatchId: uuid("import_batch_id"), // group rows from the same upload
    matchedSettlementId: uuid("matched_settlement_id").references(
      () => settlements.id,
      { onDelete: "set null" },
    ),
    matchStatus: text("match_status", {
      enum: ["unmatched", "matched", "partial", "ignored"],
    })
      .default("unmatched")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_bank_txns_factory").on(t.factoryId),
    index("idx_bank_txns_date").on(t.txnDate),
    index("idx_bank_txns_settlement").on(t.matchedSettlementId),
  ],
);
