-- DESTRUCTIVE, BY EXPLICIT INSTRUCTION (2026-09-03).
--
-- Customer name, customer number, mobile number and map location become
-- mandatory. Every existing customer predates that contract, so this clears
-- the customer book and everything hanging off it before the constraints are
-- applied. This runs on the hosted database too when it reaches
-- blm-cloud-release — do not merge it while leaf-handling data matters.

DELETE FROM "payment_lines"
WHERE "payment_id" IN (SELECT "id" FROM "payments");
--> statement-breakpoint
DELETE FROM "payments";
--> statement-breakpoint
DELETE FROM "supplier_adjustments";
--> statement-breakpoint
DELETE FROM "supplier_tiers";
--> statement-breakpoint
DELETE FROM "supplier_requests";
--> statement-breakpoint
DELETE FROM "supplier_messages";
--> statement-breakpoint
DELETE FROM "weighings";
--> statement-breakpoint
UPDATE "users" SET "supplier_id" = NULL WHERE "supplier_id" IS NOT NULL;
--> statement-breakpoint
DELETE FROM "suppliers";
--> statement-breakpoint

ALTER TABLE "suppliers" ALTER COLUMN "customer_no" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "phone" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "latitude" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "longitude" SET NOT NULL;
--> statement-breakpoint

-- customer_no is now mandatory, so the partial index is no longer needed.
DROP INDEX IF EXISTS "uq_suppliers_factory_customer_no";
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_suppliers_factory_customer_no" ON "suppliers" USING btree ("factory_id","customer_no");
--> statement-breakpoint

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_customer_no_check" CHECK (length(btrim("customer_no")) > 0);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_phone_check" CHECK (length(btrim("phone")) > 0);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);
