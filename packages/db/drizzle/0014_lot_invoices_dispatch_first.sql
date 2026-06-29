-- 0014 — Dispatch-first redesign: lot↔invoice 1:many + lifecycle rename.
--
-- The factory dispatches lots to a 3rd-party store BEFORE any sale exists; the
-- broker later catalogues a SUBSET (a partial acknowledgement). So:
--   * a lot can carry several invoice numbers (rare, but real) → lot_invoices;
--   * the lot state 'invoiced' is renamed 'dispatched' and the sale status
--     'draft' is renamed 'dispatched' (no DB CHECK exists on either column — the
--     allowed set lives in the Drizzle schema, so this is just a data rename).
-- New states 'pending' (dispatched, absent from the current ack) and 're-print'
-- (unsold, re-sampled, rolled to the next sale) need no DDL — same plain text col.

CREATE TABLE "lot_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"invoice_no" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lot_invoices" ADD CONSTRAINT "lot_invoices_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_invoices" ADD CONSTRAINT "lot_invoices_lot_id_auction_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."auction_lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_lot_invoices_factory" ON "lot_invoices" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_lot_invoices_lot" ON "lot_invoices" USING btree ("lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_lot_invoices_lot_invoice" ON "lot_invoices" USING btree ("lot_id","invoice_no");--> statement-breakpoint
-- Backfill: every existing lot's primary invoice becomes its first child row.
INSERT INTO "lot_invoices" ("factory_id","lot_id","invoice_no")
	SELECT factory_id, id, invoice_no FROM "auction_lots"
	ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Lifecycle rename (dispatch-first).
UPDATE "auction_lots" SET "state" = 'dispatched' WHERE "state" = 'invoiced';--> statement-breakpoint
UPDATE "auction_sales" SET "status" = 'dispatched' WHERE "status" = 'draft';--> statement-breakpoint
-- RLS: factory isolation on the new table (same policy as 0010).
ALTER TABLE "lot_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "lot_invoices" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
