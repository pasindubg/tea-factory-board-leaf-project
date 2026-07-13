-- 0022 — customer-editable auction grades and broker/grade min-kg thresholds.

CREATE TABLE IF NOT EXISTS "auction_grades" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "factory_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "broker_grade_thresholds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "factory_id" uuid NOT NULL,
  "broker_id" uuid NOT NULL,
  "grade_id" uuid NOT NULL,
  "min_net_kg" numeric(10,2) DEFAULT '0' NOT NULL,
  "applies" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "auction_grades"
  ADD CONSTRAINT "auction_grades_factory_id_factories_id_fk"
  FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "broker_grade_thresholds"
  ADD CONSTRAINT "broker_grade_thresholds_factory_id_factories_id_fk"
  FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "broker_grade_thresholds"
  ADD CONSTRAINT "broker_grade_thresholds_broker_id_brokers_id_fk"
  FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "broker_grade_thresholds"
  ADD CONSTRAINT "broker_grade_thresholds_grade_id_auction_grades_id_fk"
  FOREIGN KEY ("grade_id") REFERENCES "public"."auction_grades"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "idx_auction_grades_factory" ON "auction_grades" USING btree ("factory_id");
CREATE UNIQUE INDEX "uq_auction_grades_factory_code" ON "auction_grades" USING btree ("factory_id","code");
CREATE INDEX "idx_broker_grade_thresholds_factory" ON "broker_grade_thresholds" USING btree ("factory_id");
CREATE INDEX "idx_broker_grade_thresholds_broker" ON "broker_grade_thresholds" USING btree ("broker_id");
CREATE UNIQUE INDEX "uq_broker_grade_thresholds_factory_broker_grade"
  ON "broker_grade_thresholds" USING btree ("factory_id","broker_id","grade_id");

INSERT INTO "auction_grades" ("factory_id", "code", "name", "sort_order")
SELECT f.id, g.code, g.code, g.sort_order
FROM "factories" f
CROSS JOIN (
  VALUES
    ('OP', 10),
    ('OP1', 20),
    ('OPA', 30),
    ('PEK', 40),
    ('PEK1', 50),
    ('BOP', 60),
    ('BOPF', 70),
    ('FBOP', 80),
    ('DUST', 90),
    ('BM', 100)
) AS g(code, sort_order)
ON CONFLICT ("factory_id","code") DO NOTHING;

ALTER TABLE "auction_grades" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "broker_grade_thresholds" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "factory_isolation" ON "auction_grades" FOR ALL TO authenticated
  USING ("factory_id" = public.current_factory_id())
  WITH CHECK ("factory_id" = public.current_factory_id());

CREATE POLICY "factory_isolation" ON "broker_grade_thresholds" FOR ALL TO authenticated
  USING ("factory_id" = public.current_factory_id())
  WITH CHECK ("factory_id" = public.current_factory_id());
