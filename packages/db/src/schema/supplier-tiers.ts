import { pgTable, uuid, text, date, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { suppliers } from "./suppliers";
import { qualityTiers } from "./quality-tiers";
import { users } from "./users";

// Which quality tier a supplier sits in, over time. Effective-dated so a
// payment run picks the tier active at each weighing's collection date.
//
// `source` lets M7/M8 auto-scoring write assignments later; today the owner
// assigns manually. The latest effective row wins regardless of source — for a
// single factory the owner stays in control; as the platform expands, auto
// scoring is given more weight (precedence policy formalized in M7/M8).
export const supplierTiers = pgTable(
  "supplier_tiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    tierId: uuid("tier_id")
      .references(() => qualityTiers.id)
      .notNull(),
    source: text("source", { enum: ["manual", "auto"] }).default("manual").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"), // null = currently active
    note: text("note"),
    // ON DELETE SET NULL: historical attribution survives the user's removal (0008).
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_supplier_tiers_factory").on(t.factoryId),
    index("idx_supplier_tiers_supplier").on(t.supplierId),
  ],
);
