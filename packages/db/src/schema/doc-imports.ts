import { pgTable, uuid, text, jsonb, numeric, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { auctionSales } from "./auction-sales";

// Ingestion staging for broker PDFs and the bank CSV. Every import is parsed
// here first (status `parsed`), reviewed, then `confirmed` into domain tables —
// so a mis-parse never writes silently. Idempotent on (factory_id, content_hash).
export const docImports = pgTable(
  "doc_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    docType: text("doc_type", {
      enum: ["grn", "acknowledgement", "valuation", "contract", "bank_csv"],
    }).notNull(),
    sourceFilename: text("source_filename"),
    storagePath: text("storage_path"),
    contentHash: text("content_hash").notNull(),
    parsedJson: jsonb("parsed_json"),
    // Σ of the Net Proceeds a sellers contract PRINTS across its settlement
    // blocks — the broker's own figure, read from the document rather than
    // recomputed. Once every contract for a sale is confirmed, the sale's
    // total revenue is checked against the sum of these, which is the one
    // number a silently dropped sale row would move. Null for any other
    // document type, and for a contract layout that prints no such block.
    printedNetProceeds: numeric("printed_net_proceeds", { precision: 14, scale: 2 }),
    // Σ Insurance Cover the contract prints. Insurance is the one charge that
    // cannot be recomputed — Asia Siyaka levies it on a subset of lots by a
    // rule the contract never states — so it is kept to fall back on when the
    // recomputed revenue refuses to tally. Null where a layout states none.
    printedInsurance: numeric("printed_insurance", { precision: 14, scale: 2 }),
    status: text("status", { enum: ["parsed", "reviewed", "confirmed", "rejected"] })
      .default("parsed")
      .notNull(),
    // The staged document is historical evidence and survives removal of an
    // otherwise-unused Broker Invoice; only its optional link is cleared.
    saleId: uuid("sale_id").references(() => auctionSales.id, { onDelete: "set null" }),
    parsedAt: timestamp("parsed_at").defaultNow().notNull(),
    confirmedAt: timestamp("confirmed_at"),
  },
  (t) => [
    index("idx_doc_imports_factory").on(t.factoryId),
    uniqueIndex("uq_doc_imports_factory_hash").on(t.factoryId, t.contentHash),
  ],
);
