-- 0015 — auction_audit: a traceable record of every MANUAL reconciliation
-- decision (orphan link, shutout/pending/missing mark, candidate reject). Financial
-- recon → no manual override is silent. See docs/AUCTION.md §4① + #18.

CREATE TABLE "auction_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"sale_id" uuid,
	"lot_id" uuid,
	"action" text NOT NULL,
	"detail" text NOT NULL,
	"reason" text,
	"actor" text NOT NULL,
	"confidence_shown" numeric(5, 4),
	"weight_delta" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auction_audit" ADD CONSTRAINT "auction_audit_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_audit" ADD CONSTRAINT "auction_audit_sale_id_auction_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."auction_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_audit" ADD CONSTRAINT "auction_audit_lot_id_auction_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."auction_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_auction_audit_factory" ON "auction_audit" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_auction_audit_sale" ON "auction_audit" USING btree ("sale_id");--> statement-breakpoint
ALTER TABLE "auction_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "auction_audit" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
