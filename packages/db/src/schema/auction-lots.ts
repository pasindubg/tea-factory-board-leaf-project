import { pgTable, uuid, text, integer, numeric, boolean, timestamp, index, uniqueIndex, foreignKey, type AnyPgColumn } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { auctionSales } from "./auction-sales";
import { auctionGrades } from "./auction-grades";
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
      // Lots are operational children of a Broker Invoice. Financial children
      // such as sale_lines remain restrictive and therefore still block a
      // Broker Invoice delete once it has accounting history.
      .references(() => auctionSales.id, { onDelete: "cascade" })
      .notNull(),
    markId: uuid("mark_id").references(() => marks.id),
    invoiceNo: text("invoice_no").notNull(), // factory ref, e.g. 0058
    // A lot keeps its physical Broker Invoice parent in sale_id. Its expected
    // auction sale is provisional until a broker valuation confirms the final
    // sale independently for this specific invoice.
    provisionalSaleNo: text("provisional_sale_no"),
    finalSaleNo: text("final_sale_no"),
    lotNo: text("lot_no"), // broker catalogue no, e.g. 0477 — null until catalogued
    // Broker-catalogue grade CODE, referencing the factory's own auction_grades
    // set (see the composite foreign key below) — not the teaGrade enum, which
    // is the factory's intake/production grade set.
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
    // Lifecycle: invoiced → acknowledged → valued → sold. Everything else a lot
    // can be is a flag below, not a rung here.
    state: text("state", {
      enum: ["invoiced", "acknowledged", "valued", "sold"],
    })
      .default("invoiced")
      .notNull(),
    shutout: boolean("shutout").default(false).notNull(),
    shutoutReason: text("shutout_reason"),
    // Only the sellers contract sets this: it says the lot did not sell in the
    // sale it is in now. Rolling into a later sale clears it and raises
    // `reprint` instead.
    unsold: boolean("unsold").default(false).notNull(),
    reprint: boolean("reprint").default(false).notNull(),
    // An operator declared this lot a re-print by hand, because the system had
    // no record of the invoice. Kept apart from `reprint` so a declared history
    // is never mistaken for one the documents actually evidence.
    reprintRegistered: boolean("reprint_registered").default(false).notNull(),
    // The broker catalogued this lot in a LATER sale than the one it was
    // dispatched to — it skipped one or more sales without ever being offered.
    // Distinct from `reprint`: nothing was offered and left unsold here, the
    // lot simply waited. Set on BOTH rows of the pair.
    skippedSale: boolean("skipped_sale").default(false).notNull(),
    // On the origin row only: the sale the broker actually acknowledged it in.
    // The destination row leaves this null — it IS that sale.
    skippedSaleNo: text("skipped_sale_no"),
    withdrawn: boolean("withdrawn").default(false).notNull(),
    notValued: boolean("not_valued").default(false).notNull(),
    missing: boolean("missing").default(false).notNull(),
    settled: boolean("settled").default(false).notNull(),
    // Preserve the re-print row if its source is removed; the relationship is
    // historical context, not ownership.
    reprintSourceLotId: uuid("reprint_source_lot_id").references(
      (): AnyPgColumn => auctionLots.id,
      { onDelete: "set null" },
    ),
    // The origin row a SKIPPED SALE came from. Deliberately its own column and
    // never `reprint_source_lot_id`: a skipped sale is not a re-print, and
    // sharing the link meant everything keyed on it — re-print counts, the
    // re-prints page, the "Re-prints sold" figure — silently counted skipped
    // sales as re-prints. `reprint_source_lot_id` now means re-print, and only
    // re-print.
    skippedSourceLotId: uuid("skipped_source_lot_id").references(
      (): AnyPgColumn => auctionLots.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_auction_lots_factory").on(t.factoryId),
    index("idx_auction_lots_sale").on(t.saleId),
    // A sale can carry a given invoice at most once — carry-forward always
    // creates a NEW row in the destination sale (never mutates the source),
    // so this is what actually stops a duplicate child being created twice.
    uniqueIndex("uq_auction_lots_sale_invoice").on(t.saleId, t.invoiceNo),
    index("idx_auction_lots_factory_provisional_sale").on(t.factoryId, t.provisionalSaleNo),
    index("idx_auction_lots_factory_final_sale").on(t.factoryId, t.finalSaleNo),
    // LOV integrity, enforced by the database rather than by each caller: a lot
    // may only carry a grade code its own factory has defined. Because the key
    // is composite it also pins the grade to the SAME tenant, so one factory's
    // code can never satisfy another's row.
    //
    // ON UPDATE CASCADE so renaming a grade code carries into its lots.
    // ON DELETE stays NO ACTION: a grade in use must not vanish underneath the
    // lots that reference it (friendlyDeleteError reports the dependency).
    foreignKey({
      columns: [t.factoryId, t.grade],
      foreignColumns: [auctionGrades.factoryId, auctionGrades.code],
      name: "fk_auction_lots_grade",
    }).onUpdate("cascade"),
  ],
);
