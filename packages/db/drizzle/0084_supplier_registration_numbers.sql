CREATE TABLE "supplier_registration_counters" (
	"factory_id" uuid PRIMARY KEY NOT NULL,
	"last_no" integer NOT NULL,
	CONSTRAINT "supplier_registration_counters_positive" CHECK ("supplier_registration_counters"."last_no" > 0)
);
--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "customer_no" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "registration_no" integer;
--> statement-breakpoint
-- Preserve existing customer numbers. Give existing rows their own immutable
-- registration number in creation order before enabling automatic allocation.
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY factory_id ORDER BY created_at, id)::integer AS n
  FROM public.suppliers
)
UPDATE public.suppliers s SET registration_no = numbered.n FROM numbered WHERE s.id = numbered.id;
INSERT INTO public.supplier_registration_counters(factory_id, last_no)
  SELECT factory_id, max(registration_no) FROM public.suppliers GROUP BY factory_id;
ALTER TABLE public.suppliers ALTER COLUMN registration_no SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_registration_counters" ADD CONSTRAINT "supplier_registration_counters_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_suppliers_factory_registration_no" ON "suppliers" USING btree ("factory_id","registration_no");--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_registration_no_check" CHECK ("suppliers"."registration_no" > 0);
--> statement-breakpoint
ALTER TABLE public.supplier_registration_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_registration_counters FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.supplier_registration_counters TO authenticated;
-- Invoker trigger access only. Direct Data API queries cannot read or change
-- this state, including when the caller is an office user. No definer bypass.
CREATE POLICY registration_counter_read ON public.supplier_registration_counters
  FOR SELECT TO authenticated USING (factory_id = (SELECT public.current_factory_id()) AND pg_trigger_depth() = 1);
CREATE POLICY registration_counter_insert ON public.supplier_registration_counters
  FOR INSERT TO authenticated WITH CHECK (factory_id = (SELECT public.current_factory_id()) AND pg_trigger_depth() = 1);
CREATE POLICY registration_counter_update ON public.supplier_registration_counters
  FOR UPDATE TO authenticated
  USING (factory_id = (SELECT public.current_factory_id()) AND pg_trigger_depth() = 1)
  WITH CHECK (factory_id = (SELECT public.current_factory_id()) AND pg_trigger_depth() = 1);
--> statement-breakpoint
CREATE FUNCTION public.assign_supplier_registration_number() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.registration_no IS NOT NULL THEN
      RAISE EXCEPTION 'Registration number is generated automatically.' USING ERRCODE = '23514';
    END IF;
    -- The row lock taken by the upsert serializes concurrent registrations in
    -- this factory. A failed registration rolls its counter increment back.
    INSERT INTO public.supplier_registration_counters(factory_id, last_no)
      VALUES (NEW.factory_id, 1)
      ON CONFLICT (factory_id) DO UPDATE SET last_no = supplier_registration_counters.last_no + 1
      RETURNING last_no INTO NEW.registration_no;
  ELSIF NEW.registration_no IS DISTINCT FROM OLD.registration_no
      OR NEW.factory_id IS DISTINCT FROM OLD.factory_id THEN
    RAISE EXCEPTION 'Registration number and factory cannot be changed.' USING ERRCODE = '23514';
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.customer_no IS NOT NULL)
      OR (TG_OP = 'UPDATE' AND NEW.customer_no IS DISTINCT FROM OLD.customer_no) THEN
    IF current_user = 'authenticated' AND coalesce(public.current_user_role(), '') NOT IN ('owner', 'manager', 'supervisor', 'accountant') THEN
      RAISE EXCEPTION 'The office assigns the existing customer number in the ERP.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_supplier_registration_number() FROM PUBLIC;
CREATE TRIGGER supplier_registration_number BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.assign_supplier_registration_number();
