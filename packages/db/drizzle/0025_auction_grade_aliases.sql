-- 0025 — aliases for broker-specific tea grade spellings.

CREATE TABLE IF NOT EXISTS "auction_grade_aliases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "factory_id" uuid NOT NULL,
  "grade_id" uuid NOT NULL,
  "alias" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auction_grade_aliases_factory_id_factories_id_fk'
  ) THEN
    ALTER TABLE "auction_grade_aliases"
      ADD CONSTRAINT "auction_grade_aliases_factory_id_factories_id_fk"
      FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auction_grade_aliases_grade_id_auction_grades_id_fk'
  ) THEN
    ALTER TABLE "auction_grade_aliases"
      ADD CONSTRAINT "auction_grade_aliases_grade_id_auction_grades_id_fk"
      FOREIGN KEY ("grade_id") REFERENCES "public"."auction_grades"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_auction_grade_aliases_factory"
  ON "auction_grade_aliases" USING btree ("factory_id");

CREATE INDEX IF NOT EXISTS "idx_auction_grade_aliases_grade"
  ON "auction_grade_aliases" USING btree ("grade_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_auction_grade_aliases_factory_alias"
  ON "auction_grade_aliases" USING btree ("factory_id","alias");

ALTER TABLE "auction_grade_aliases" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'auction_grade_aliases'
      AND policyname = 'factory_isolation'
  ) THEN
    CREATE POLICY "factory_isolation" ON "auction_grade_aliases" FOR ALL TO authenticated
      USING ("factory_id" = public.current_factory_id())
      WITH CHECK ("factory_id" = public.current_factory_id());
  END IF;
END $$;
