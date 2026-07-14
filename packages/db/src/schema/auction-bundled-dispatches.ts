import { boolean, date, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { auctionSales } from "./auction-sales";

// A physical outbound dispatch groups confirmed Broker Invoices that leave the
// same warehouse on the same date. Lots remain owned by their Broker Invoice;
// this association is the operational shipping bundle.
export const auctionBundledDispatches = pgTable(
  "auction_bundled_dispatches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id").references(() => factories.id).notNull(),
    dispatchNo: text("dispatch_no").notNull(),
    // dispatchDate remains the start date for compatibility with existing
    // dispatch reporting; the inclusive range is stored explicitly below.
    dispatchDate: date("dispatch_date").notNull(),
    dispatchDateFrom: date("dispatch_date_from").notNull(),
    dispatchDateTo: date("dispatch_date_to").notNull(),
    warehouse: text("warehouse").notNull(),
    // Daily bundles are created automatically when a Broker Invoice is made.
    // Manual date-range bundles remain supported for legacy records.
    autoCreated: boolean("auto_created").default(false).notNull(),
    status: text("status", { enum: ["draft", "dispatched"] }).default("draft").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_auction_bundled_dispatches_factory").on(t.factoryId),
    index("idx_auction_bundled_dispatches_factory_date").on(t.factoryId, t.dispatchDate),
    index("idx_auction_bundled_dispatches_factory_date_range").on(t.factoryId, t.dispatchDateFrom, t.dispatchDateTo),
    uniqueIndex("uq_auction_bundled_dispatches_factory_no").on(t.factoryId, t.dispatchNo),
  ],
);

export const auctionBundledDispatchInvoices = pgTable(
  "auction_bundled_dispatch_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id").references(() => factories.id).notNull(),
    bundledDispatchId: uuid("bundled_dispatch_id").references(() => auctionBundledDispatches.id, { onDelete: "cascade" }).notNull(),
    brokerInvoiceId: uuid("broker_invoice_id").references(() => auctionSales.id, { onDelete: "cascade" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_auction_bundled_dispatch_invoices_factory").on(t.factoryId),
    index("idx_auction_bundled_dispatch_invoices_bundle").on(t.bundledDispatchId),
    uniqueIndex("uq_auction_bundled_dispatch_invoices_invoice").on(t.brokerInvoiceId),
    uniqueIndex("uq_auction_bundled_dispatch_invoices_bundle_invoice").on(t.bundledDispatchId, t.brokerInvoiceId),
  ],
);
