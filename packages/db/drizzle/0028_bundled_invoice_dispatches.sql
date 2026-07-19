-- 0028 — a physical Dispatch is a bundle of confirmed Broker Invoices.
-- Lots retain their Broker Invoice parent; the join table records which
-- invoices moved together from a warehouse on a particular date.

CREATE TABLE "auction_bundled_dispatches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "factory_id" uuid NOT NULL REFERENCES "factories"("id") ON DELETE CASCADE,
  "dispatch_no" text NOT NULL,
  "dispatch_date" date NOT NULL,
  "warehouse" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "auction_bundled_dispatches_status_check" CHECK ("status" IN ('draft', 'dispatched')),
  CONSTRAINT "uq_auction_bundled_dispatches_factory_no" UNIQUE ("factory_id", "dispatch_no")
);

CREATE INDEX "idx_auction_bundled_dispatches_factory" ON "auction_bundled_dispatches" USING btree ("factory_id");
CREATE INDEX "idx_auction_bundled_dispatches_factory_date" ON "auction_bundled_dispatches" USING btree ("factory_id", "dispatch_date");

CREATE TABLE "auction_bundled_dispatch_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "factory_id" uuid NOT NULL REFERENCES "factories"("id") ON DELETE CASCADE,
  "bundled_dispatch_id" uuid NOT NULL REFERENCES "auction_bundled_dispatches"("id") ON DELETE CASCADE,
  "broker_invoice_id" uuid NOT NULL REFERENCES "auction_sales"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "uq_auction_bundled_dispatch_invoices_invoice" UNIQUE ("broker_invoice_id"),
  CONSTRAINT "uq_auction_bundled_dispatch_invoices_bundle_invoice" UNIQUE ("bundled_dispatch_id", "broker_invoice_id")
);

CREATE INDEX "idx_auction_bundled_dispatch_invoices_factory" ON "auction_bundled_dispatch_invoices" USING btree ("factory_id");
CREATE INDEX "idx_auction_bundled_dispatch_invoices_bundle" ON "auction_bundled_dispatch_invoices" USING btree ("bundled_dispatch_id");

ALTER TABLE "auction_bundled_dispatches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auction_bundled_dispatch_invoices" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "factory_isolation" ON "auction_bundled_dispatches"
  FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());

CREATE POLICY "factory_isolation" ON "auction_bundled_dispatch_invoices"
  FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
