CREATE TABLE "list_search_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"list_scope" text NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"advanced_query" text,
	"sort_key" text,
	"sort_dir" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_search_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"list_scope" text NOT NULL,
	"base_role" text,
	"access_role_id" uuid,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "list_search_locks_role_key_check" CHECK (("list_search_locks"."base_role" is not null) <> ("list_search_locks"."access_role_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "list_search_states" ADD CONSTRAINT "list_search_states_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_search_states" ADD CONSTRAINT "list_search_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_search_locks" ADD CONSTRAINT "list_search_locks_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_search_locks" ADD CONSTRAINT "list_search_locks_access_role_id_access_roles_id_fk" FOREIGN KEY ("access_role_id") REFERENCES "public"."access_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_search_locks" ADD CONSTRAINT "list_search_locks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "list_search_states_user_scope_unique" ON "list_search_states" USING btree ("user_id","list_scope");--> statement-breakpoint
CREATE INDEX "idx_list_search_states_factory" ON "list_search_states" USING btree ("factory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "list_search_locks_factory_scope_base_role_unique" ON "list_search_locks" USING btree ("factory_id","list_scope","base_role") WHERE "list_search_locks"."base_role" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "list_search_locks_factory_scope_access_role_unique" ON "list_search_locks" USING btree ("factory_id","list_scope","access_role_id") WHERE "list_search_locks"."access_role_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_list_search_locks_factory" ON "list_search_locks" USING btree ("factory_id");
--> statement-breakpoint

ALTER TABLE "list_search_states" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "list_search_locks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- list_search_states: purely personal — a user only ever sees/writes their own
-- saved search, still factory-scoped for defense in depth.
CREATE POLICY "list_search_states_own_row" ON "list_search_states"
  FOR ALL TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND user_id = auth.uid()
  );
--> statement-breakpoint

-- list_search_locks: everyone in the factory can read locks (needed to render
-- disabled search fields and to resolve the lock server-side); only
-- owner/manager can create, change, or remove one.
CREATE POLICY "list_search_locks_factory_read" ON "list_search_locks"
  FOR SELECT TO authenticated
  USING (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "list_search_locks_manager_insert" ON "list_search_locks"
  FOR INSERT TO authenticated
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );
--> statement-breakpoint
CREATE POLICY "list_search_locks_manager_update" ON "list_search_locks"
  FOR UPDATE TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );
--> statement-breakpoint
CREATE POLICY "list_search_locks_manager_delete" ON "list_search_locks"
  FOR DELETE TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );