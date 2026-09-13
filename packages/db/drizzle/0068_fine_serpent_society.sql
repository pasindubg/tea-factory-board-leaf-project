-- Customer numbers become digits only. Factories number their customer book
-- plainly; the "A-"/"B-" prefixes were a seed convention, never something a
-- clerk types. Existing numbers keep their digits (and leading zeros) and lose
-- everything else, so "A-0001" becomes "0001".
--
-- The check is added after the backfill: anything that cannot be reduced to
-- digits fails here rather than being silently mangled.

ALTER TABLE "suppliers" DROP CONSTRAINT IF EXISTS "suppliers_customer_no_check";
--> statement-breakpoint

UPDATE "suppliers"
SET "customer_no" = regexp_replace("customer_no", '[^0-9]', '', 'g')
WHERE "customer_no" ~ '[^0-9]';
--> statement-breakpoint

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_customer_no_check" CHECK ("suppliers"."customer_no" ~ '^[0-9]+$');
