CREATE TABLE "auction_dispatch_bag_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"check_id" uuid NOT NULL,
	"bag_id" uuid,
	"event_type" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"detail" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dispatch_bag_event_type" CHECK ("auction_dispatch_bag_events"."event_type" IN ('manifest_started', 'bag_confirmed')),
	CONSTRAINT "dispatch_bag_event_bag_relation" CHECK (("auction_dispatch_bag_events"."event_type" = 'manifest_started' AND "auction_dispatch_bag_events"."bag_id" IS NULL) OR ("auction_dispatch_bag_events"."event_type" = 'bag_confirmed' AND "auction_dispatch_bag_events"."bag_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "auction_dispatch_bag_events" ADD CONSTRAINT "auction_dispatch_bag_events_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_dispatch_bag_events" ADD CONSTRAINT "auction_dispatch_bag_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_dispatch_bag_events" ADD CONSTRAINT "fk_dispatch_bag_events_dispatch" FOREIGN KEY ("factory_id","dispatch_id") REFERENCES "public"."auction_bundled_dispatches"("factory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_dispatch_bag_events" ADD CONSTRAINT "fk_dispatch_bag_events_check" FOREIGN KEY ("factory_id","check_id") REFERENCES "public"."auction_dispatch_lot_checks"("factory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_dispatch_bag_events" ADD CONSTRAINT "fk_dispatch_bag_events_bag" FOREIGN KEY ("factory_id","bag_id") REFERENCES "public"."auction_dispatch_bags"("factory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_auction_dispatch_bag_events_factory_dispatch" ON "auction_dispatch_bag_events" USING btree ("factory_id","dispatch_id");--> statement-breakpoint

ALTER TABLE public.auction_dispatch_bag_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY factory_isolation_read ON public.auction_dispatch_bag_events
  FOR SELECT TO authenticated USING (factory_id = public.current_factory_id());--> statement-breakpoint
CREATE POLICY factory_isolation_insert ON public.auction_dispatch_bag_events
  FOR INSERT TO authenticated WITH CHECK (
    factory_id = public.current_factory_id() AND current_setting('app.dispatch_bag_write', true) = 'on'
    AND actor_id = auth.uid()
  );--> statement-breakpoint

CREATE FUNCTION public.record_dispatch_manifest_start() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  INSERT INTO public.auction_dispatch_bag_events
    (factory_id, dispatch_id, check_id, event_type, actor_id, detail)
  VALUES (NEW.factory_id, NEW.dispatch_id, NEW.id, 'manifest_started', auth.uid(),
    jsonb_build_object('lotId', NEW.lot_id, 'grade', NEW.grade,
      'expectedBags', NEW.expected_bags, 'targetGrams', NEW.target_grams,
      'underToleranceGrams', NEW.under_tolerance_grams,
      'overToleranceGrams', NEW.over_tolerance_grams,
      'policyVersion', NEW.policy_version));
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER record_dispatch_manifest_start AFTER INSERT ON public.auction_dispatch_lot_checks
  FOR EACH ROW EXECUTE FUNCTION public.record_dispatch_manifest_start();--> statement-breakpoint

CREATE FUNCTION public.record_dispatch_bag_confirmation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_check public.auction_dispatch_lot_checks%ROWTYPE;
BEGIN
  IF OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL THEN
    SELECT * INTO v_check FROM public.auction_dispatch_lot_checks
      WHERE factory_id = NEW.factory_id AND id = NEW.check_id;
    INSERT INTO public.auction_dispatch_bag_events
      (factory_id, dispatch_id, check_id, bag_id, event_type, actor_id, detail)
    VALUES (NEW.factory_id, NEW.dispatch_id, NEW.check_id, NEW.id,
      'bag_confirmed', NEW.confirmed_by,
      jsonb_build_object('lotId', v_check.lot_id, 'bagNumber', NEW.bag_number,
        'measuredGrams', NEW.measured_grams, 'targetGrams', v_check.target_grams,
        'underToleranceGrams', v_check.under_tolerance_grams,
        'overToleranceGrams', v_check.over_tolerance_grams,
        'policyVersion', v_check.policy_version, 'deviceId', NEW.device_id,
        'loadId', NEW.load_id, 'readingId', NEW.reading_id,
        'requestId', NEW.request_id));
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER record_dispatch_bag_confirmation AFTER UPDATE ON public.auction_dispatch_bags
  FOR EACH ROW EXECUTE FUNCTION public.record_dispatch_bag_confirmation();--> statement-breakpoint

CREATE FUNCTION public.guard_dispatch_bag_event_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Dispatch bag audit history is append-only.';
END $$;--> statement-breakpoint
CREATE TRIGGER guard_dispatch_bag_event_history BEFORE UPDATE OR DELETE ON public.auction_dispatch_bag_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_dispatch_bag_event_history();--> statement-breakpoint

REVOKE ALL ON TABLE public.auction_dispatch_bag_events FROM anon, anonymous;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.auction_dispatch_bag_events TO authenticated;
