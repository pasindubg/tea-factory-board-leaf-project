-- FA0–FA2: field-app foundation (issue #13).
-- request_types  — server-driven request catalogue (dynamic menu/forms, DB-only)
-- supplier_requests — supplier requests + money-handover trust loop
-- users.supplier_id — links a supplier-role login to its suppliers row
-- suppliers.lat/lng — map location captured at registration
--
-- NOTE: the 0004/0005 column adds drizzle-kit re-emitted (stale 0003 baseline
-- snapshot; 0004/0005 were hand-written without snapshots) were removed by hand —
-- those columns already exist. 0006_snapshot.json is a correct full snapshot, so
-- future db:generate diffs cleanly.

CREATE TABLE "request_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"label_si" text,
	"label_ta" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requires_amount" boolean DEFAULT false NOT NULL,
	"creates_advance" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"factory_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"type_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"amount" numeric(12, 2),
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp,
	"handed_by" uuid,
	"handed_at" timestamp,
	"acknowledged_at" timestamp,
	"adjustment_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "longitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "request_types" ADD CONSTRAINT "request_types_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_requests" ADD CONSTRAINT "supplier_requests_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_requests" ADD CONSTRAINT "supplier_requests_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_requests" ADD CONSTRAINT "supplier_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_requests" ADD CONSTRAINT "supplier_requests_handed_by_users_id_fk" FOREIGN KEY ("handed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_requests" ADD CONSTRAINT "supplier_requests_adjustment_id_supplier_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."supplier_adjustments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_request_types_factory" ON "request_types" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_requests_factory" ON "supplier_requests" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_requests_supplier" ON "supplier_requests" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_requests_status" ON "supplier_requests" USING btree ("status");--> statement-breakpoint
-- ============================================================================
-- Row Level Security (hand-added — drizzle-kit does not emit policies).
-- Same factory-isolation discipline as 0001; supplier_requests additionally
-- scopes to the logged-in supplier so one supplier can't read/write another's.
-- ============================================================================
-- Helper: the current authenticated user's linked supplier id, or NULL for
-- factory staff/driver. SECURITY DEFINER so the lookup itself bypasses RLS
-- (mirrors current_factory_id / current_user_role in 0001/0003).
CREATE OR REPLACE FUNCTION public.current_supplier_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT supplier_id FROM public.users WHERE id = auth.uid()
$$;
--> statement-breakpoint
ALTER TABLE "request_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplier_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- request_types: every factory member (incl. suppliers) reads it to render the
-- request menu; only management edits the catalogue.
CREATE POLICY "factory_isolation_read" ON "request_types"
  FOR SELECT TO authenticated
  USING (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "management_insert" ON "request_types"
  FOR INSERT TO authenticated
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );
--> statement-breakpoint
CREATE POLICY "management_update" ON "request_types"
  FOR UPDATE TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );
--> statement-breakpoint
CREATE POLICY "management_delete" ON "request_types"
  FOR DELETE TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );
--> statement-breakpoint
-- supplier_requests: tenant-isolated AND supplier-scoped. Staff (supplier_id
-- NULL) act on every row in their factory; a supplier only ever sees or writes
-- rows for their own supplier_id. Status-transition rules (a supplier may only
-- acknowledge/cancel, never approve) are enforced in the server/app layer.
CREATE POLICY "factory_isolation" ON "supplier_requests"
  FOR ALL TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND (public.current_supplier_id() IS NULL OR supplier_id = public.current_supplier_id())
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND (public.current_supplier_id() IS NULL OR supplier_id = public.current_supplier_id())
  );
