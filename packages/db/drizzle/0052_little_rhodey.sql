-- 0052 — background jobs become a queue, and gain schedules.
--
-- Until now a "background job" was only background in its bookkeeping: the work
-- ran inside the server action's request, so the request's lifetime was the
-- job's lifetime and navigating away killed it mid-import. These columns are
-- what let a worker pick a run up instead — the run carries its own input, its
-- own resume point, and a lease saying who is working on it.
--
-- Hand-written rather than left as drizzle-kit generated it. 0051 was itself
-- hand-written, so the 0051 snapshot never recorded BACKGROUND_JOB_RUNS, and
-- the generated file therefore tried to CREATE a table that already exists.
-- The 0052 snapshot is correct and future generates will diff cleanly against
-- it; only this SQL needed replacing.
--
-- Idempotent throughout — every statement is conditional, so re-running the
-- file changes nothing and no pre-existing row can block a deploy.
--
-- Both table names are upper case: every reference MUST stay double-quoted,
-- and PostgREST callers must match the case exactly.

-- ---------------------------------------------------------------------------
-- Schedules. A recurring job. When one comes due the worker inserts an ordinary
-- run for it, so a scheduled run and a hand-started run are the same thing
-- afterwards — one queue, one overview, one set of commands.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "BACKGROUND_JOB_SCHEDULES" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"job_key" text NOT NULL,
	"label" text,
	-- A small explicit vocabulary rather than cron syntax: `every 15m`,
	-- `daily 06:00`, `weekly mon 06:00`, `monthly 1 06:00`. Text, so a real cron
	-- parser can replace the evaluator later without a migration.
	"spec" text NOT NULL,
	-- Evaluated in this zone, never the server's. A schedule that says 06:00
	-- means 06:00 in Sri Lanka; the server clock is UTC and must not decide.
	"timezone" text DEFAULT 'Asia/Colombo' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	-- Paused rather than deleted, so its history and next run survive.
	"active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamptz,
	"next_run_at" timestamptz,
	"created_by" uuid,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BACKGROUND_JOB_SCHEDULES_factory_id_factories_id_fk') THEN
    ALTER TABLE "BACKGROUND_JOB_SCHEDULES" ADD CONSTRAINT "BACKGROUND_JOB_SCHEDULES_factory_id_factories_id_fk"
      FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BACKGROUND_JOB_SCHEDULES_created_by_users_id_fk') THEN
    ALTER TABLE "BACKGROUND_JOB_SCHEDULES" ADD CONSTRAINT "BACKGROUND_JOB_SCHEDULES_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_background_job_schedules_factory" ON "BACKGROUND_JOB_SCHEDULES" USING btree ("factory_id");--> statement-breakpoint
-- The only query the promotion step makes: what is due, across every tenant.
CREATE INDEX IF NOT EXISTS "idx_background_job_schedules_due" ON "BACKGROUND_JOB_SCHEDULES" USING btree ("active","next_run_at");--> statement-breakpoint

ALTER TABLE "BACKGROUND_JOB_SCHEDULES" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "factory_isolation" ON "BACKGROUND_JOB_SCHEDULES";--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "BACKGROUND_JOB_SCHEDULES"
  FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Runs become queue entries.
-- ---------------------------------------------------------------------------

-- The job's input, resolved by the action that queued it. References, never
-- bytes: an upload becomes a Storage path here, because a worker running
-- minutes later cannot be handed the browser's file.
ALTER TABLE "BACKGROUND_JOB_RUNS" ADD COLUMN IF NOT EXISTS "payload" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Where to carry on from, written by the job's own handler and handed back to
-- it unchanged. Opaque to this table.
ALTER TABLE "BACKGROUND_JOB_RUNS" ADD COLUMN IF NOT EXISTS "cursor" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Diagnostic only. Nothing fails a run for reaching a number: a run ends when
-- it finishes, when it errors, or when a person cancels it.
ALTER TABLE "BACKGROUND_JOB_RUNS" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "BACKGROUND_JOB_RUNS" ADD COLUMN IF NOT EXISTS "worker_id" text;--> statement-breakpoint
-- Who holds this run, and until when. Lease expiry is what makes a dead
-- worker's run claimable again, and lets the overview tell a run that is
-- genuinely progressing from one whose worker is gone.
ALTER TABLE "BACKGROUND_JOB_RUNS" ADD COLUMN IF NOT EXISTS "lease_until" timestamptz;--> statement-breakpoint
-- Earliest moment this run may be claimed. Execute sets it to now.
ALTER TABLE "BACKGROUND_JOB_RUNS" ADD COLUMN IF NOT EXISTS "run_after" timestamptz DEFAULT now() NOT NULL;--> statement-breakpoint
-- Set by Cancel. The worker checks it between units and stops there, so a
-- cancel lands at a unit boundary rather than mid-write.
ALTER TABLE "BACKGROUND_JOB_RUNS" ADD COLUMN IF NOT EXISTS "cancel_requested_at" timestamptz;--> statement-breakpoint
ALTER TABLE "BACKGROUND_JOB_RUNS" ADD COLUMN IF NOT EXISTS "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "BACKGROUND_JOB_RUNS" ADD COLUMN IF NOT EXISTS "schedule_id" uuid;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BACKGROUND_JOB_RUNS_cancelled_by_users_id_fk') THEN
    ALTER TABLE "BACKGROUND_JOB_RUNS" ADD CONSTRAINT "BACKGROUND_JOB_RUNS_cancelled_by_users_id_fk"
      FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BACKGROUND_JOB_RUNS_schedule_id_BACKGROUND_JOB_SCHEDULES_id_fk') THEN
    ALTER TABLE "BACKGROUND_JOB_RUNS" ADD CONSTRAINT "BACKGROUND_JOB_RUNS_schedule_id_BACKGROUND_JOB_SCHEDULES_id_fk"
      FOREIGN KEY ("schedule_id") REFERENCES "public"."BACKGROUND_JOB_SCHEDULES"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

-- Heal before constraining: every run still sitting in `running` predates the
-- queue, so its worker was the request that started it and is long gone. They
-- are marked cancelled — which the overview shows as "Interrupted" — rather
-- than left to be picked up and silently restarted by the first worker to
-- deploy. Anything outside the new domain is normalised the same way.
UPDATE "BACKGROUND_JOB_RUNS"
   SET status = 'cancelled',
       finished_at = COALESCE(finished_at, now())
 WHERE status = 'running'
    OR status NOT IN ('queued', 'running', 'completed', 'failed', 'cancelled');
--> statement-breakpoint

-- A run now starts life queued: written by the action, picked up by a worker,
-- so nothing depends on the request that created it staying open.
ALTER TABLE "BACKGROUND_JOB_RUNS" ALTER COLUMN "status" SET DEFAULT 'queued';--> statement-breakpoint
ALTER TABLE "BACKGROUND_JOB_RUNS" DROP CONSTRAINT IF EXISTS "background_job_runs_status_check";--> statement-breakpoint
ALTER TABLE "BACKGROUND_JOB_RUNS" ADD CONSTRAINT "background_job_runs_status_check"
  CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));
--> statement-breakpoint

-- The only query a worker makes, and it runs across every tenant.
CREATE INDEX IF NOT EXISTS "idx_background_job_runs_claim" ON "BACKGROUND_JOB_RUNS" USING btree ("status","run_after");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Claiming.
--
-- SECURITY DEFINER because claiming is inherently cross-tenant: one worker
-- serves every factory, and there is no session to scope it by. This is the
-- same deliberate use as current_factory_id(), not a way around a permission
-- error — the function hands back exactly one run and nothing else, and every
-- piece of tenant work the worker then does happens under a client scoped to
-- the run's own factory, with RLS enforcing it as usual.
--
-- SKIP LOCKED is what makes two overlapping ticks safe: the second one takes a
-- different run rather than waiting or duplicating.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_background_job(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF "BACKGROUND_JOB_RUNS"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
    FROM "BACKGROUND_JOB_RUNS"
   WHERE cancel_requested_at IS NULL
     AND run_after <= now()
     AND (
       status = 'queued'
       -- A running row whose lease has lapsed: its worker died. Reclaiming it
       -- is the whole reason the lease exists.
       OR (status = 'running' AND (lease_until IS NULL OR lease_until < now()))
     )
   ORDER BY run_after
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE "BACKGROUND_JOB_RUNS"
     SET status = 'running',
         worker_id = p_worker_id,
         lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts = attempts + 1,
         updated_at = now()
   WHERE id = v_id
  RETURNING *;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.claim_background_job(text, integer) FROM PUBLIC;--> statement-breakpoint
-- The worker only. Never `authenticated`: a signed-in user must not be able to
-- claim another factory's run.
GRANT EXECUTE ON FUNCTION public.claim_background_job(text, integer) TO service_role;
