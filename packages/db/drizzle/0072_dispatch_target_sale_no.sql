ALTER TABLE "auction_bundled_dispatches" ADD COLUMN "target_sale_no" text;--> statement-breakpoint
UPDATE "auction_bundled_dispatches" d SET "target_sale_no" = s.target_sale_no
  FROM (
    SELECT "bundled_dispatch_id", min("target_sale_no") AS target_sale_no
    FROM "auction_sales"
    WHERE "sale_kind" = 'dispatch' AND "bundled_dispatch_id" IS NOT NULL AND "target_sale_no" IS NOT NULL
    GROUP BY "bundled_dispatch_id"
    HAVING count(DISTINCT "target_sale_no") = 1
  ) s
  WHERE d."id" = s."bundled_dispatch_id";
