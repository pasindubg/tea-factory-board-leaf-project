CREATE TABLE "access_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"base_role" text NOT NULL,
	"system_role" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_page_permissions" (
	"role_id" uuid NOT NULL,
	"factory_id" uuid NOT NULL,
	"page_key" text NOT NULL,
	"can_view" boolean DEFAULT false NOT NULL,
	"can_create" boolean DEFAULT false NOT NULL,
	"can_update" boolean DEFAULT false NOT NULL,
	"can_delete" boolean DEFAULT false NOT NULL,
	CONSTRAINT "role_page_permissions_role_id_page_key_pk" PRIMARY KEY("role_id","page_key")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "access_role_id" uuid;--> statement-breakpoint
ALTER TABLE "access_roles" ADD CONSTRAINT "access_roles_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_page_permissions" ADD CONSTRAINT "role_page_permissions_role_id_access_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."access_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_page_permissions" ADD CONSTRAINT "role_page_permissions_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_roles_factory_key_unique" ON "access_roles" USING btree ("factory_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "access_roles_factory_name_unique" ON "access_roles" USING btree ("factory_id","name");--> statement-breakpoint
CREATE INDEX "idx_access_roles_factory" ON "access_roles" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_role_page_permissions_factory" ON "role_page_permissions" USING btree ("factory_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_access_role_id_access_roles_id_fk" FOREIGN KEY ("access_role_id") REFERENCES "public"."access_roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_access_role" ON "users" USING btree ("access_role_id");
--> statement-breakpoint

-- Capture the existing application roles as first-class roles in every
-- factory. Their base role remains the authority used by the existing RLS
-- policies, so this migration cannot broaden a user's database privileges.
INSERT INTO "access_roles" ("factory_id", "key", "name", "base_role", "system_role")
SELECT factories.id, seed.key, seed.name, seed.key, true
FROM "factories"
CROSS JOIN (
  VALUES
    ('owner', 'Owner'),
    ('manager', 'Manager'),
    ('supervisor', 'Supervisor'),
    ('accountant', 'Accountant'),
    ('collector', 'Collector'),
    ('supplier', 'Supplier'),
    ('driver', 'Driver')
) AS seed(key, name)
ON CONFLICT ("factory_id", "key") DO NOTHING;
--> statement-breakpoint

-- Link all existing accounts to their equivalent new role. New custom roles
-- are assigned through the User Handling screen and retain their base role in
-- users.role for RLS compatibility.
UPDATE "users" AS account
SET "access_role_id" = role.id
FROM "access_roles" AS role
WHERE role.factory_id = account.factory_id
  AND role.system_role = true
  AND role.key = account.role
  AND account.access_role_id IS NULL;
--> statement-breakpoint

ALTER TABLE "access_roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "role_page_permissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "access_roles_factory_read" ON "access_roles"
  FOR SELECT TO authenticated
  USING (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "access_roles_owner_insert" ON "access_roles"
  FOR INSERT TO authenticated
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint
CREATE POLICY "access_roles_owner_update" ON "access_roles"
  FOR UPDATE TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint
CREATE POLICY "access_roles_owner_delete" ON "access_roles"
  FOR DELETE TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint

CREATE POLICY "role_page_permissions_factory_read" ON "role_page_permissions"
  FOR SELECT TO authenticated
  USING (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "role_page_permissions_owner_insert" ON "role_page_permissions"
  FOR INSERT TO authenticated
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint
CREATE POLICY "role_page_permissions_owner_update" ON "role_page_permissions"
  FOR UPDATE TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint
CREATE POLICY "role_page_permissions_owner_delete" ON "role_page_permissions"
  FOR DELETE TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
