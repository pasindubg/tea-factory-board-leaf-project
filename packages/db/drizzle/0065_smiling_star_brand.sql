CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"vehicle_no" text NOT NULL,
	"make_model" text,
	"capacity_kg" numeric(10, 2),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"phone" text,
	"nic_number" text,
	"licence_no" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"line_no" text NOT NULL,
	"name" text,
	"vehicle_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"platform" text,
	"model" text,
	"app_version" text,
	"last_seen_at" timestamp,
	"revoked_at" timestamp,
	"revoked_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "customer_no" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "line_id" uuid;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "cultivated_area_acres" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "location_accuracy_m" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "location_captured_at" timestamp;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "photo_path" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "bank_book_path" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "bank_account_no" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "bank_branch" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "bank_parse_status" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "registered_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "registered_at" timestamp;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "client_uuid" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vehicles_factory_id" ON "vehicles" USING btree ("factory_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_drivers_factory_id" ON "drivers" USING btree ("factory_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_lines_factory_id" ON "lines" USING btree ("factory_id","id");--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lines" ADD CONSTRAINT "lines_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lines" ADD CONSTRAINT "fk_lines_vehicle" FOREIGN KEY ("factory_id","vehicle_id") REFERENCES "public"."vehicles"("factory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_drivers" ADD CONSTRAINT "line_drivers_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_drivers" ADD CONSTRAINT "fk_line_drivers_line" FOREIGN KEY ("factory_id","line_id") REFERENCES "public"."lines"("factory_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_drivers" ADD CONSTRAINT "fk_line_drivers_driver" FOREIGN KEY ("factory_id","driver_id") REFERENCES "public"."drivers"("factory_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_vehicles_factory" ON "vehicles" USING btree ("factory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vehicles_factory_no" ON "vehicles" USING btree ("factory_id","vehicle_no");--> statement-breakpoint
CREATE INDEX "idx_drivers_factory" ON "drivers" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_lines_factory" ON "lines" USING btree ("factory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_lines_factory_no" ON "lines" USING btree ("factory_id","line_no");--> statement-breakpoint
CREATE INDEX "idx_line_drivers_factory" ON "line_drivers" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_line_drivers_line" ON "line_drivers" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "idx_line_drivers_driver" ON "line_drivers" USING btree ("driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_line_drivers_line_driver" ON "line_drivers" USING btree ("line_id","driver_id");--> statement-breakpoint
CREATE INDEX "idx_user_devices_factory" ON "user_devices" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_user_devices_user" ON "user_devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_devices_user_device" ON "user_devices" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_devices_user_active" ON "user_devices" USING btree ("user_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_registered_by_user_id_users_id_fk" FOREIGN KEY ("registered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "fk_suppliers_line" FOREIGN KEY ("factory_id","line_id") REFERENCES "public"."lines"("factory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_suppliers_line" ON "suppliers" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "idx_suppliers_geo" ON "suppliers" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_suppliers_factory_customer_no" ON "suppliers" USING btree ("factory_id","customer_no") WHERE "customer_no" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_suppliers_client_uuid" ON "suppliers" USING btree ("client_uuid") WHERE "client_uuid" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "drivers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "line_drivers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_devices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "factory_isolation" ON "vehicles" FOR ALL TO authenticated
  USING ("factory_id" = public.current_factory_id())
  WITH CHECK ("factory_id" = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "drivers" FOR ALL TO authenticated
  USING ("factory_id" = public.current_factory_id())
  WITH CHECK ("factory_id" = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "lines" FOR ALL TO authenticated
  USING ("factory_id" = public.current_factory_id())
  WITH CHECK ("factory_id" = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "line_drivers" FOR ALL TO authenticated
  USING ("factory_id" = public.current_factory_id())
  WITH CHECK ("factory_id" = public.current_factory_id());
--> statement-breakpoint

-- The field app sends its secure-storage device id on every request. Reading it
-- here lets RLS refuse a write from any phone other than the bound one.
CREATE OR REPLACE FUNCTION public.current_device_id()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT nullif(current_setting('request.headers', true)::json ->> 'x-device-id', '');
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.device_is_bound()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_devices d
    WHERE d.user_id = auth.uid()
      AND d.device_id = public.current_device_id()
      AND d.revoked_at IS NULL
  );
$$;
--> statement-breakpoint

-- Devices are claimed through register_device() and revoked from the web by
-- management, so a field login cannot clear its own binding and re-pair.
CREATE POLICY "own_or_management_read" ON "user_devices" FOR SELECT TO authenticated
  USING (
    "factory_id" = public.current_factory_id()
    AND ("user_id" = auth.uid() OR public.current_user_role() IN ('owner', 'manager'))
  );
--> statement-breakpoint
CREATE POLICY "management_write" ON "user_devices" FOR UPDATE TO authenticated
  USING ("factory_id" = public.current_factory_id() AND public.current_user_role() IN ('owner', 'manager'))
  WITH CHECK ("factory_id" = public.current_factory_id());
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.register_device(
  p_device_id text,
  p_platform text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_app_version text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_factory uuid;
  v_existing public.user_devices%ROWTYPE;
BEGIN
  IF v_user IS NULL OR p_device_id IS NULL OR length(trim(p_device_id)) = 0 THEN
    RETURN 'invalid';
  END IF;

  SELECT factory_id INTO v_factory FROM public.users WHERE id = v_user;
  IF v_factory IS NULL THEN
    RETURN 'invalid';
  END IF;

  SELECT * INTO v_existing FROM public.user_devices
  WHERE user_id = v_user AND revoked_at IS NULL
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.device_id = p_device_id THEN
      UPDATE public.user_devices
      SET last_seen_at = now(), app_version = COALESCE(p_app_version, app_version)
      WHERE id = v_existing.id;
      RETURN 'bound';
    END IF;
    RETURN 'blocked';
  END IF;

  INSERT INTO public.user_devices (factory_id, user_id, device_id, platform, model, app_version, last_seen_at)
  VALUES (v_factory, v_user, p_device_id, p_platform, p_model, p_app_version, now())
  ON CONFLICT (user_id, device_id) DO UPDATE
    SET revoked_at = NULL, revoked_by = NULL, last_seen_at = now();
  RETURN 'claimed';
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.register_device(text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.register_device(text, text, text, text) TO authenticated;
--> statement-breakpoint

-- Restrictive: a field officer's writes only pass from the phone their login is
-- bound to. Every other role is unaffected.
CREATE POLICY "field_officer_device_bound" ON "suppliers" AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.current_user_role() <> 'field_officer' OR public.device_is_bound())
  WITH CHECK (public.current_user_role() <> 'field_officer' OR public.device_is_bound());