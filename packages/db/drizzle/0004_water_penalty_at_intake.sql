ALTER TABLE "weighings" ADD COLUMN "water_penalty" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "water_penalty_mode" text DEFAULT 'percent' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "water_penalty_per_kg" numeric(10, 2) DEFAULT '0' NOT NULL;
