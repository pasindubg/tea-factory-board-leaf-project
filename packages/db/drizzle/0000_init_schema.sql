CREATE TYPE "public"."tea_grade" AS ENUM('BOP', 'BOPF', 'OP', 'OPA', 'FBOP', 'FNGS', 'DUST', 'PD', 'GREEN_LEAF');--> statement-breakpoint
CREATE TABLE "factories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"registration_number" text,
	"contact_phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"factory_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role" text NOT NULL,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"phone" text,
	"nic_number" text,
	"area" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"collector_id" uuid,
	"name" text NOT NULL,
	"phone" text,
	"nic_number" text,
	"land_size_acres" numeric(8, 2),
	"area" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"grade" "tea_grade" NOT NULL,
	"price_per_kg" numeric(10, 2) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"lot_number" text NOT NULL,
	"grade" "tea_grade" NOT NULL,
	"date" date NOT NULL,
	"status" text DEFAULT 'open',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weighings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"factory_id" uuid NOT NULL,
	"collector_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"lot_id" uuid,
	"weight_kg" numeric(8, 2) NOT NULL,
	"grade" "tea_grade" DEFAULT 'GREEN_LEAF' NOT NULL,
	"collected_at" timestamp NOT NULL,
	"synced_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"total_kg" numeric(12, 2) NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'pending',
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectors" ADD CONSTRAINT "collectors_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectors" ADD CONSTRAINT "collectors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_rates" ADD CONSTRAINT "price_rates_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weighings" ADD CONSTRAINT "weighings_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weighings" ADD CONSTRAINT "weighings_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weighings" ADD CONSTRAINT "weighings_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weighings" ADD CONSTRAINT "weighings_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_factory" ON "users" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_collectors_factory" ON "collectors" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_suppliers_factory" ON "suppliers" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_price_rates_factory" ON "price_rates" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_lots_factory" ON "lots" USING btree ("factory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_lots_factory_lot_number" ON "lots" USING btree ("factory_id","lot_number");--> statement-breakpoint
CREATE INDEX "idx_weighings_factory" ON "weighings" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_weighings_supplier" ON "weighings" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_weighings_collected_at" ON "weighings" USING btree ("collected_at");--> statement-breakpoint
CREATE INDEX "idx_payments_factory" ON "payments" USING btree ("factory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payments_supplier_period" ON "payments" USING btree ("supplier_id","period_year","period_month");