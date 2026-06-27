-- FA3: factory → supplier messaging (issue #13).
-- supplier_messages: direct (supplier_id set) or broadcast (supplier_id NULL).

CREATE TABLE "supplier_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"supplier_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_messages" ADD CONSTRAINT "supplier_messages_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_messages" ADD CONSTRAINT "supplier_messages_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_messages" ADD CONSTRAINT "supplier_messages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_supplier_messages_factory" ON "supplier_messages" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_messages_supplier" ON "supplier_messages" USING btree ("supplier_id");--> statement-breakpoint
-- ============================================================================
-- Row Level Security (hand-added — drizzle-kit does not emit policies).
-- Suppliers read their own direct messages + factory broadcasts; only
-- management composes; a supplier may update read_at on their own messages.
-- ============================================================================
ALTER TABLE "supplier_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "read_visibility" ON "supplier_messages"
  FOR SELECT TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND (
      public.current_supplier_id() IS NULL          -- staff: every factory row
      OR supplier_id = public.current_supplier_id()  -- supplier: own direct messages
      OR supplier_id IS NULL                         -- supplier: broadcasts
    )
  );
--> statement-breakpoint
CREATE POLICY "management_insert" ON "supplier_messages"
  FOR INSERT TO authenticated
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager', 'supervisor')
  );
--> statement-breakpoint
-- Staff update any factory row; a supplier may mark their own direct message
-- read. Broadcasts (supplier_id NULL) are not updatable by a supplier.
CREATE POLICY "update_own_or_staff" ON "supplier_messages"
  FOR UPDATE TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND (public.current_supplier_id() IS NULL OR supplier_id = public.current_supplier_id())
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND (public.current_supplier_id() IS NULL OR supplier_id = public.current_supplier_id())
  );
--> statement-breakpoint
CREATE POLICY "management_delete" ON "supplier_messages"
  FOR DELETE TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager', 'supervisor')
  );
