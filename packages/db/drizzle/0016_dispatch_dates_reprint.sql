-- 0016 — dispatch_date on auction_sales, reprint_source_lot_id on auction_lots.
--
-- dispatch_date: records when the factory physically dispatched the lots to
-- the broker's store. Mandatory on creation, defaults to today. The existing
-- sale_date remains optional (the auction date, ~3 weeks later).
--
-- reprint_source_lot_id: when a lot is auto-detected as a re-print during ack
-- confirmation (via re-invoice numbers in the BPML ack PDF), this links the
-- new lot back to the original dispatched lot for audit trail.

ALTER TABLE "auction_sales" ADD COLUMN "dispatch_date" date NOT NULL DEFAULT current_date;
--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "reprint_source_lot_id" uuid;
--> statement-breakpoint
ALTER TABLE "auction_lots" ADD CONSTRAINT "reprint_source_lot_id_fk" FOREIGN KEY ("reprint_source_lot_id") REFERENCES "public"."auction_lots"("id") ON DELETE set null ON UPDATE no action;
