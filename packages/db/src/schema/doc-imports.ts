import { pgTable, uuid, text, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { factories } from "./factories";

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
    status: text("status", { enum: ["parsed", "reviewed", "confirmed", "rejected"] })
      .default("parsed")
      .notNull(),
    saleId: uuid("sale_id"), // linked sale once confirmed (no FK — kept generic)
    parsedAt: timestamp("parsed_at").defaultNow().notNull(),
    confirmedAt: timestamp("confirmed_at"),
  },
  (t) => [
    index("idx_doc_imports_factory").on(t.factoryId),
    uniqueIndex("uq_doc_imports_factory_hash").on(t.factoryId, t.contentHash),
  ],
);
