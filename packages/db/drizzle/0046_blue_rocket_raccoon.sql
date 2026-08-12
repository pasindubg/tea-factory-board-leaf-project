ALTER TABLE "auction_bundled_dispatches" ADD COLUMN "dispatched_at" timestamp;--> statement-breakpoint
-- Hand-added: the status CHECK was written by hand in an earlier migration, so
-- drizzle-kit does not widen it when the TypeScript enum gains a value. Without
-- this the two derived stages would be rejected at write time.
ALTER TABLE "auction_bundled_dispatches" DROP CONSTRAINT "auction_bundled_dispatches_status_check";--> statement-breakpoint
ALTER TABLE "auction_bundled_dispatches" ADD CONSTRAINT "auction_bundled_dispatches_status_check"
  CHECK (status = ANY (ARRAY['draft'::text, 'dispatched'::text, 'received'::text, 'catalogued'::text]));--> statement-breakpoint
-- Any dispatch already marked as dispatched predates dispatched_at. Seed it so
-- the derivation reports "dispatched" rather than falling back to "draft".
UPDATE "auction_bundled_dispatches" SET "dispatched_at" = COALESCE("created_at", now())
  WHERE "status" = 'dispatched' AND "dispatched_at" IS NULL;
