import { NextResponse } from "next/server";
import { getJobsEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildJobActor } from "@/lib/jobs/actor";
import { runAsJobActor } from "@/lib/jobs/context";
import { JOB_HANDLERS, type JobRun } from "@/lib/jobs/registry";
import { isJobKey, type JobKey } from "@/lib/background-jobs";

/**
 * The background job worker: claims one run, does a slice of it, and exits.
 *
 * Everything about this shape exists to survive the thing that kept killing the
 * dispatch import — a job's life being tied to something that ends. It was the
 * browser's request, so navigating away stopped it. Then it was one function
 * invocation, so the platform's duration cap stopped it at row 40 of 230.
 * Neither is fixed by making the job faster; the job has to be able to stop and
 * be picked up again.
 *
 * So a chunk is short and always leaves a cursor behind. If this invocation
 * dies for any reason, the lease it holds expires and the next tick claims the
 * same run and carries on from that cursor. Nothing is lost but the units
 * between the last cursor write and the death.
 *
 * There is no time limit on a JOB. maxDuration bounds one CHUNK, which is what
 * makes an unbounded job possible.
 */

// Node, not Edge: minting a token uses node:crypto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The platform ceiling for one chunk. Hobby caps this at 60. */
export const maxDuration = 60;

/**
 * Stop this early and hand back a cursor. The gap covers the writes that follow
 * the last unit — losing those would mean redoing units already applied.
 */
const CHUNK_BUDGET_MS = 45_000;

/**
 * How long a claim is held. Longer than a chunk, so a slow chunk does not have
 * its run stolen; short enough that a dead worker's run is picked up soon.
 */
const LEASE_SECONDS = 120;

const TABLE = "BACKGROUND_JOB_RUNS";

function authorised(request: Request, secret: string) {
  // Vercel signs its own cron invocations; anything else must present the
  // secret. This route causes tenant writes, so it is never open.
  if (request.headers.get("x-vercel-cron")) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  let env;
  try {
    env = getJobsEnv();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
  if (!authorised(request, env.tickSecret)) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  // The admin client is used for exactly one thing: invoking the claim, which
  // is inherently cross-tenant because one worker serves every factory. It
  // returns a single run and is never used to read or write a table — all
  // tenant work below happens under the run's own user, with RLS enforcing it.
  const admin = createAdminClient();
  const workerId = `${process.env.VERCEL_DEPLOYMENT_ID ?? "local"}:${crypto.randomUUID().slice(0, 8)}`;

  const claim = await admin.rpc("claim_background_job", {
    p_worker_id: workerId,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claim.error) {
    return NextResponse.json({ error: claim.error.message }, { status: 500 });
  }
  const claimed = (claim.data as Record<string, unknown>[] | null)?.[0];
  if (!claimed) return NextResponse.json({ claimed: 0 });

  const run: JobRun = {
    id: claimed.id as string,
    factoryId: claimed.factory_id as string,
    startedBy: (claimed.started_by as string | null) ?? null,
    jobKey: claimed.job_key as JobKey,
    label: (claimed.label as string | null) ?? null,
    totalUnits: Number(claimed.total_units ?? 0),
    processedUnits: Number(claimed.processed_units ?? 0),
    metrics: (claimed.metrics as Record<string, number> | null) ?? {},
    payload: (claimed.payload as Record<string, unknown> | null) ?? {},
    cursor: (claimed.cursor as Record<string, unknown> | null) ?? {},
  };

  const fail = async (message: string) => {
    await admin
      .from(TABLE)
      .update({ status: "failed", error: message, finished_at: new Date().toISOString(), lease_until: null, updated_at: new Date().toISOString() })
      .eq("id", run.id);
    return NextResponse.json({ runId: run.id, status: "failed", error: message });
  };

  // A key with no handler is failed rather than left claimed, so it appears on
  // the overview instead of being silently reclaimed by every later tick.
  const handler = isJobKey(run.jobKey) ? JOB_HANDLERS[run.jobKey] : undefined;
  if (!handler) return fail(`No worker handler is registered for "${run.jobKey}".`);

  // Somebody has to be acted as. Running unscoped is what this design refuses,
  // so a run with no user is a failure rather than a licence.
  if (!run.startedBy) {
    return fail("This run has no user to act as — it cannot be run by the worker.");
  }

  // Re-read at claim time, never stored on the run: a job started days ago must
  // not carry rights its owner has since lost.
  const built = await buildJobActor(run.startedBy);
  if (!built.actor) return fail(built.error);
  const actor = built.actor;
  const supabase = actor.supabase;

  const isCancelled = async () => {
    const { data } = await supabase.from(TABLE).select("cancel_requested_at").eq("id", run.id).single();
    return Boolean(data?.cancel_requested_at);
  };

  try {
    // Inside this, every access gate in lib/profile.ts resolves to the actor
    // rather than to a cookie — which is what lets a handler call the same
    // server actions a page does, without a session and without paying an auth
    // round trip per call.
    const result = await runAsJobActor(actor, () =>
      handler({
        run,
        supabase,
        deadline: Date.now() + CHUNK_BUDGET_MS,
        cancelled: isCancelled,
        // Status is deliberately left alone: the run is already `running`, and
        // only the end of a chunk decides what it becomes next.
        reportProgress: async ({ cursor, processedUnits, metrics }) => {
          await supabase
            .from(TABLE)
            .update({ cursor, processed_units: processedUnits, metrics, updated_at: new Date().toISOString() })
            .eq("id", run.id);
        },
      }),
    );

    const cancelled = await isCancelled();
    const finished = cancelled || result.done;
    const now = new Date().toISOString();

    // Read-append-write rather than a jsonb concat: the chunk only knows the
    // rows IT applied, and the report has to accumulate across every chunk or
    // a resumed run would show only its last slice.
    let items = result.items ?? [];
    if (items.length > 0) {
      const { data: existing } = await supabase.from(TABLE).select("items").eq("id", run.id).single();
      items = [...((existing?.items as typeof items | null) ?? []), ...items];
    }

    // Progress is written whatever the outcome — a cancelled run keeps what it
    // managed to do, and the cursor is what a later Execute would resume from.
    const { error } = await supabase
      .from(TABLE)
      .update({
        cursor: result.cursor,
        processed_units: result.processedUnits,
        metrics: result.metrics,
        ...(result.items?.length ? { items } : {}),
        status: cancelled ? "cancelled" : result.done ? "completed" : "queued",
        finished_at: finished ? now : null,
        lease_until: null,
        run_after: now,
        updated_at: now,
      })
      .eq("id", run.id);
    if (error) return fail(error.message);

    return NextResponse.json({
      runId: run.id,
      jobKey: run.jobKey,
      processedUnits: result.processedUnits,
      totalUnits: run.totalUnits,
      status: cancelled ? "cancelled" : result.done ? "completed" : "queued",
      // The caller re-ticks on this rather than the worker looping, so every
      // chunk is a fresh invocation with a fresh duration budget.
      more: !finished,
    });
  } catch (error) {
    // The run keeps the cursor it last wrote, so Execute can pick it up rather
    // than starting over. Nothing retries on a timer — a person decides.
    return fail(error instanceof Error ? error.message : String(error));
  }
}

/** Rejects a browser that wanders onto the URL, rather than 405-ing obscurely. */
export function GET() {
  return NextResponse.json({ error: "POST only." }, { status: 405 });
}
