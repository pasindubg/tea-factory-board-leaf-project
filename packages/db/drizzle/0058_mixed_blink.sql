ALTER TABLE "auction_lots" ADD COLUMN "skipped_sale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "skipped_sale_no" text;