import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildJobActor } from "@/lib/jobs/actor";
import { runAsJobActor } from "@/lib/jobs/context";
import { triggerJobTick } from "@/lib/jobs/trigger";
import { JOB_HANDLERS, type JobRun } from "@/lib/jobs/registry";
import { isJobKey, type JobKey } from "@/lib/background-jobs";

/**
 * Claiming and running one chunk, callable without an HTTP request.
 *
 * Split out of the route so the upload can run the FIRST chunk in process.
 * Starting a job used to depend on the app reaching itself over HTTP, and when
 * that call was refused nothing said so — the run just sat at "Waiting to
 * start" and was eventually reported as "0 of 230". after() already outlives
 * the response, so no request is needed to begin.
 *
 * HTTP is still how one chunk hands over to the next, because only a new
 * request buys a fresh duration budget.
 */

/** Where a chunk yields, of the 300s available. Checked between units, so the
 * 60s left over covers one slow unit plus the writes and the handover. */
const CHUNK_BUDGET_MS = 240_000;

/** Must exceed a whole chunk, or a slow chunk has its run stolen and units are
 * applied twice. */
const LEASE_SECONDS = 360;

const TABLE = "BACKGROUND_JOB_RUNS";

/** Past this, a run with no live worker is dead rather than slow. Must match
 * the poll's own threshold in app/_actions/background-jobs.ts. */
const DEAD_AFTER_MS = 180_000;

/**
 * Fails runs no worker holds and nothing has touched for DEAD_AFTER_MS.
 *
 * Without it the claim resurrects them forever: a run abandoned an hour ago is
 * still `running` with a lapsed lease, sorts before today's upload by
 * run_after, and so every tick picks IT up while the fresh run waits. Execute
 * is how an abandoned run is resumed — deliberately, by a person.
 */
async function sweepDeadRuns(admin: ReturnType<typeof createAdminClient>) {
  const now = new Date().toISOString();
  const deadline = new Date(Date.now() - DEAD_AFTER_MS).toISOString();
  const { error } = await admin
    .from(TABLE)
    .update({
      status: "failed",
      error: "Interrupted — the worker stopped and did not restart. Use Execute to resume from where it stopped.",
      finished_at: now,
      lease_until: null,
      updated_at: now,
    })
    .eq("status", "running")
    .lt("updated_at", deadline)
    .or(`lease_until.is.null,lease_until.lt.${now}`);
  if (error) console.error(`[jobs] sweep failed: ${error.message}`);
}


/** One slice, after the response. No HTTP status can reach anybody from here,
 * so every failure lands on the run row instead. */
export async function runChunk(run: JobRun, selfBase: string | null) {
  const admin = createAdminClient();

  const fail = async (message: string) => {
    await admin
      .from(TABLE)
      .update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
        lease_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    console.error(`[jobs] run ${run.id} (${run.jobKey}) failed: ${message}`);
  };

  // Failed, not left claimed: otherwise every later tick silently reclaims it.
  const handler = isJobKey(run.jobKey) ? JOB_HANDLERS[run.jobKey] : undefined;
  if (!handler) return fail(`No worker handler is registered for "${run.jobKey}".`);

  // Running unscoped is what this design refuses.
  if (!run.startedBy) {
    return fail("This run has no user to act as — it cannot be run by the worker.");
  }

  // Re-read per claim: a job queued days ago must not carry rights since lost.
  const built = await buildJobActor(run.startedBy);
  if (!built.actor) return fail(built.error);
  const actor = built.actor;
  const supabase = actor.supabase;

  const isCancelled = async () => {
    const { data } = await supabase.from(TABLE).select("cancel_requested_at").eq("id", run.id).single();
    return Boolean(data?.cancel_requested_at);
  };

  try {
    // Inside this, every gate in lib/profile.ts resolves to the actor rather
    // than a cookie — so a handler can call the same server actions a page does.
    const result = await runAsJobActor(actor, () =>
      handler({
        run,
        supabase,
        deadline: Date.now() + CHUNK_BUDGET_MS,
        cancelled: isCancelled,
        // Status left alone: only the end of a chunk decides what it becomes.
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

    // Neither finished nor advanced would chain forever, achieving nothing.
    if (!finished && result.processedUnits <= run.processedUnits) {
      return fail(
        `The worker ran for ${Math.round(CHUNK_BUDGET_MS / 1000)}s without completing a single unit ` +
          `(stuck at ${result.processedUnits} of ${run.totalUnits}). Stopping rather than retrying forever.`,
      );
    }

    // Read-append-write: a chunk knows only its own rows, and the report has
    // to accumulate across all of them.
    let items = result.items ?? [];
    if (items.length > 0) {
      const { data: existing } = await supabase.from(TABLE).select("items").eq("id", run.id).single();
      items = [...((existing?.items as typeof items | null) ?? []), ...items];
    }

    // Written whatever the outcome, so a cancelled run keeps what it did.
    // Unfinished stays `running` with no lease, not `queued`: both are
    // claimable, but "Waiting to start" at 12 of 230 is a lie and it also
    // stopped the page polling.
    const { error } = await supabase
      .from(TABLE)
      .update({
        cursor: result.cursor,
        processed_units: result.processedUnits,
        metrics: result.metrics,
        ...(result.items?.length ? { items } : {}),
        status: cancelled ? "cancelled" : result.done ? "completed" : "running",
        finished_at: finished ? now : null,
        lease_until: null,
        run_after: now,
        updated_at: now,
      })
      .eq("id", run.id);
    if (error) return fail(error.message);

    // Which chunk printed last is the whole diagnosis when a chain breaks.
    console.log(
      `[jobs] ${run.jobKey} ${run.id}: ${run.processedUnits} → ${result.processedUnits} of ${run.totalUnits}` +
        ` (${cancelled ? "cancelled" : result.done ? "completed" : "handing over"})`,
    );

    // The handover. Fresh invocation, fresh duration budget, same cursor. A
    // refused handover is written onto the run: it used to be logged only, so
    // the operator saw a stalled bar and no reason for it.
    if (!finished) {
      const handover = await triggerJobTick(selfBase ?? undefined);
      if (!handover.ok) {
        await supabase
          .from(TABLE)
          .update({ error: `Stopped after ${result.processedUnits} of ${run.totalUnits} — ${handover.reason}. Use Execute to continue.` })
          .eq("id", run.id);
      }
    }
  } catch (error) {
    // The cursor survives, so Execute resumes. Nothing retries on a timer.
    await fail(error instanceof Error ? error.message : String(error));
  }
}


/** Claims the next runnable run, sweeping dead ones out of its way first.
 * Returns null when the queue is empty. */
export async function claimRun(): Promise<JobRun | null> {
  const admin = createAdminClient();
  await sweepDeadRuns(admin);

  const workerId = `${process.env.VERCEL_DEPLOYMENT_ID ?? "local"}:${crypto.randomUUID().slice(0, 8)}`;
  const claim = await admin.rpc("claim_background_job", {
    p_worker_id: workerId,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claim.error) throw new Error(claim.error.message);

  const claimed = (claim.data as Record<string, unknown>[] | null)?.[0];
  if (!claimed) return null;

  return {
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
}

/** Claims and runs one chunk in this invocation. Used by the upload to start a
 * run without an HTTP round trip to ourselves. */
export async function claimAndRunChunk(baseUrl: string | null): Promise<void> {
  try {
    const run = await claimRun();
    if (run) await runChunk(run, baseUrl);
  } catch (error) {
    console.error("[jobs] could not start a chunk:", error instanceof Error ? error.message : error);
  }
}
