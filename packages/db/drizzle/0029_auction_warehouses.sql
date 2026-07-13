-- Factory-owned warehouse master for physical bundled dispatches. A warehouse
-- may be retired without removing it from the operational list/history.

CREATE TABLE "auction_warehouses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "factory_id" uuid NOT NULL REFERENCES "factories"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "uq_auction_warehouses_factory_name" UNIQUE ("factory_id", "name")
);

CREATE INDEX "idx_auction_warehouses_factory" ON "auction_warehouses" USING btree ("factory_id");

ALTER TABLE "auction_warehouses" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "factory_isolation" ON "auction_warehouses"
  FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());

-- Provide a usable initial LOV for every current factory. The legacy entry is
-- intentionally retired to demonstrate the non-selectable historical state.
INSERT INTO "auction_warehouses" ("factory_id", "name", "active")
SELECT "id", 'Main warehouse', true FROM "factories"
ON CONFLICT ("factory_id", "name") DO NOTHING;

INSERT INTO "auction_warehouses" ("factory_id", "name", "active")
SELECT "id", 'Legacy warehouse', false FROM "factories"
ON CONFLICT ("factory_id", "name") DO NOTHING;
