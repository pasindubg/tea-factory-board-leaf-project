-- 0051 — framework-level background job tracking.
--
-- A long server action outlives the page that started it: the tab can be
-- refreshed or closed while the work continues. Holding progress only in the
-- browser loses it — the operator watches an idle form while records keep
-- appearing, and never sees the final report. This row is where progress lives
-- so any tab can read it, including one that did not start the run.
--
-- Job-agnostic on purpose. `job_key` names an allowlisted job definition (see
-- apps/web/lib/background-jobs.ts) which owns the labels, units and
-- presentation, exactly as a list resource key names a read model. The table
-- stores only what every job has: how far it got, what it tallied, and what
-- happened to each item.
--
-- Idempotent: table, constraints, indexes and policy are all conditional, so
-- re-running the file changes nothing.
--
-- The table name is upper case, so every reference to it MUST stay
-- double-quoted: PostgreSQL folds unquoted identifiers to lower case, and
-- `from BACKGROUND_JOB_RUNS` would look for a table called
-- `background_job_runs` that does not exist. Supabase/PostgREST callers must
-- match the case exactly too — `.from("BACKGROUND_JOB_RUNS")`.

CREATE TABLE IF NOT EXISTS "BACKGROUND_JOB_RUNS" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"started_by" uuid,
	"job_key" text NOT NULL,
	"label" text,
	"status" text DEFAULT 'running' NOT NULL,
	"total_units" integer DEFAULT 0 NOT NULL,
	"processed_units" integer DEFAULT 0 NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	-- timestamptz, NOT timestamp. `updated_at` is a heartbeat compared against
	-- the clock in application code, and a naive timestamp is reinterpreted as
	-- machine-local when it becomes a JS Date — which made a brand-new row look
	-- 5.5 hours old and every running job report itself as interrupted.
	"started_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	"finished_at" timestamptz
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'background_job_runs_factory_id_factories_id_fk') THEN
    ALTER TABLE "BACKGROUND_JOB_RUNS" ADD CONSTRAINT "background_job_runs_factory_id_factories_id_fk"
      FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'background_job_runs_started_by_users_id_fk') THEN
    ALTER TABLE "BACKGROUND_JOB_RUNS" ADD CONSTRAINT "background_job_runs_started_by_users_id_fk"
      FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_background_job_runs_factory" ON "BACKGROUND_JOB_RUNS" USING btree ("factory_id");
--> statement-breakpoint
-- The lookup every poll makes: newest run of one job for one factory.
CREATE INDEX IF NOT EXISTS "idx_background_job_runs_factory_job_started" ON "BACKGROUND_JOB_RUNS" USING btree ("factory_id","job_key","started_at");
--> statement-breakpoint
-- Tenant isolation travels with the table, not the job.
ALTER TABLE "BACKGROUND_JOB_RUNS" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "factory_isolation" ON "BACKGROUND_JOB_RUNS";
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "BACKGROUND_JOB_RUNS"
  FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
