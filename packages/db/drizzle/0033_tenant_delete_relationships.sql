-- Centralise user-triggered delete semantics in PostgreSQL.
--
-- Cascades below are limited to configuration or operational rows that have no
-- independent meaning without their parent. Financial/accounting relationships
-- (sale_lines, vat_ledger, settlements) deliberately remain restrictive.

ALTER TABLE "broker_rates"
  DROP CONSTRAINT IF EXISTS "broker_rates_broker_id_brokers_id_fk";
--> statement-breakpoint
ALTER TABLE "broker_rates"
  ADD CONSTRAINT "broker_rates_broker_id_brokers_id_fk"
  FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "auction_lots"
  DROP CONSTRAINT IF EXISTS "auction_lots_sale_id_auction_sales_id_fk";
--> statement-breakpoint
ALTER TABLE "auction_lots"
  ADD CONSTRAINT "auction_lots_sale_id_auction_sales_id_fk"
  FOREIGN KEY ("sale_id") REFERENCES "public"."auction_sales"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "valuations"
  DROP CONSTRAINT IF EXISTS "valuations_lot_id_auction_lots_id_fk";
--> statement-breakpoint
ALTER TABLE "valuations"
  ADD CONSTRAINT "valuations_lot_id_auction_lots_id_fk"
  FOREIGN KEY ("lot_id") REFERENCES "public"."auction_lots"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Imports are evidence, not owned children. Clear invalid historic links before
-- adding the FK, then preserve the import by nulling only its optional sale link.
UPDATE "doc_imports" AS d
SET "sale_id" = NULL
WHERE d."sale_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "auction_sales" AS s
    WHERE s."id" = d."sale_id"
      AND s."factory_id" = d."factory_id"
  );
--> statement-breakpoint
ALTER TABLE "doc_imports"
  DROP CONSTRAINT IF EXISTS "doc_imports_sale_id_auction_sales_id_fk";
--> statement-breakpoint
ALTER TABLE "doc_imports"
  ADD CONSTRAINT "doc_imports_sale_id_auction_sales_id_fk"
  FOREIGN KEY ("sale_id") REFERENCES "public"."auction_sales"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

-- Removing an application login must preserve operational/history rows while
-- atomically clearing their nullable actor association.
ALTER TABLE "collectors"
  DROP CONSTRAINT IF EXISTS "collectors_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "collectors"
  ADD CONSTRAINT "collectors_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "supplier_messages"
  DROP CONSTRAINT IF EXISTS "supplier_messages_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_messages"
  ADD CONSTRAINT "supplier_messages_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "supplier_requests"
  DROP CONSTRAINT IF EXISTS "supplier_requests_decided_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_requests"
  ADD CONSTRAINT "supplier_requests_decided_by_users_id_fk"
  FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_requests"
  DROP CONSTRAINT IF EXISTS "supplier_requests_handed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_requests"
  ADD CONSTRAINT "supplier_requests_handed_by_users_id_fk"
  FOREIGN KEY ("handed_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
