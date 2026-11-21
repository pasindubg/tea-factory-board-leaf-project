import { sql } from "drizzle-orm";
import { pgTable, uuid, integer, check } from "drizzle-orm/pg-core";
import { factories } from "./factories";

// Internal transaction counter. RLS permits access only from the supplier
// numbering trigger; callers cannot reserve, reset or delete numbers.
export const supplierRegistrationCounters = pgTable("supplier_registration_counters", {
  factoryId: uuid("factory_id").primaryKey().references(() => factories.id),
  lastNo: integer("last_no").notNull(),
}, (t) => [check("supplier_registration_counters_positive", sql`${t.lastNo} > 0`)]);
