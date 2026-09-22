ALTER TABLE "auction_bundled_dispatches" DROP CONSTRAINT "auction_bundled_dispatches_status_check";--> statement-breakpoint
ALTER TABLE "auction_bundled_dispatches" ADD CONSTRAINT "auction_bundled_dispatches_status_check"
  CHECK (status = ANY (ARRAY['draft'::text, 'invoiced'::text, 'dispatched'::text, 'received'::text, 'catalogued'::text]));--> statement-breakpoint
UPDATE "auction_bundled_dispatches" d SET "status" = 'invoiced'
  WHERE d."status" = 'draft'
    AND d."dispatched_at" IS NULL
    AND EXISTS (
      SELECT 1 FROM "auction_sales" s
      WHERE s."bundled_dispatch_id" = d."id" AND s."sale_kind" = 'dispatch'
    )
    AND NOT EXISTS (
      SELECT 1 FROM "auction_sales" s
      WHERE s."bundled_dispatch_id" = d."id" AND s."sale_kind" = 'dispatch'
        AND (s."status" IS NULL OR s."status" IN ('draft', 'dispatched'))
    );
