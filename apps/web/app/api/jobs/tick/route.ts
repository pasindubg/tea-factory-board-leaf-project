import { after, NextResponse } from "next/server";
import { getJobsEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildJobActor } from "@/lib/jobs/actor";
import { runAsJobActor } from "@/lib/jobs/context";
import { baseUrlFromHeaders, triggerJobTick } from "@/lib/jobs/trigger";
import { JOB_HANDLERS, type JobRun } from "@/lib/jobs/registry";
import { isJobKey, type JobKey } from "@/lib/background-jobs";

/**
 * The background job worker: claims one run, does a slice of it, and hands over.
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
 * THERE IS NO TIME LIMIT ON A JOB, and nothing here imposes one. The platform
 * bounds a single invocation and always will; a chunk yielding before that
 * bound, with a cursor written, is precisely what turns a bounded invocation
 * into an unbounded job.
 *
 * WHY THIS RESPONDS BEFORE IT WORKS. A chunk that does not finish the run has
 * to hand over to another invocation, and the handover is an HTTP call to this
 * same route. If the work happened before the response, that call would not
 * return for a full chunk, so every tick would sit holding a connection open
 * across its successor's entire chunk — nested, and killed by the platform long
 * before the run ended. Claiming first and responding immediately makes the
 * handover cost milliseconds, so the chain is flat: each chunk starts a fresh
 * invocation with a fresh duration budget and then exits.
 *
 * This is the piece that was missing. The route used to return `more: true` and
 * expect "the caller" to tick again, but the only caller was a fire-and-forget
 * nudge that never read the response. A run therefore did exactly one chunk and
 * went back to the queue, where nothing but the daily cron would ever find it —
 * invisible locally, where 230 rows fit in one chunk, and immediately obvious in
 * production, where 12 did.
 *
 * WHAT CALLS THIS. Normally the action that queued the run, immediately, via
 * lib/jobs/trigger.ts — that is the trigger. The cron in vercel.json is only a
 * backstop for a nudge that never arrived, and a weak one: Hobby refuses to
 * deploy any schedule that would fire more than once a day, and one tick claims
 * one run and does one chunk. Execute on the Background jobs page is the real
 * recovery path. (That reasoning lives here because vercel.json is strict JSON
 * — it rejects a `comment` key on a cron, and has nowhere else to put it.)
 */

// Node, not Edge: minting a token uses node:crypto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// NO maxDuration EXPORT, DELIBERATELY. Declaring one can only ever shorten the
// invocation: with fluid compute (on by default) Hobby's default AND maximum
// are both 300s, so the `export const maxDuration = 60` that used to sit here
// was cutting every chunk to a fifth of what the platform already allowed —
// five times more handovers, five times more chances for the chain to break.
// Leaving it unset takes the platform default, which is also the ceiling.
// (If chunks ever come back short, check Settings ▸ Functions ▸ Default Max
// Duration — a project-level default overrides the platform one.)

/**
 * When a chunk stops and hands over. NOT a limit on the job — it is what makes
 * the job unlimited. A chunk that yields here writes a cursor and the next one
 * resumes from it, so a run of any length is a sequence of finite chunks. The
 * only thing that would happen without it is the platform killing the
 * invocation mid-unit, with no cursor written and no successor called, which
 * strands the entire run.
 *
 * 240s of the 300s available. The deadline is checked BETWEEN units, so a unit
 * starting just under it overruns; the remaining 60s covers a unit several
 * times slower than the ~4s a dispatch row costs in production, plus the final
 * writes and the handover.
 */
const CHUNK_BUDGET_MS = 240_000;

/**
 * How long a claim is held. Must exceed a whole chunk, or a slow chunk has its
 * run stolen by the next tick and both workers apply the same units.
 */
const LEASE_SECONDS = 360;

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

  // Read while the request is still in hand. Inside after() the response has
  // gone and request APIs are no longer dependable, but the chain needs a URL
  // to hand over to.
  const selfBase = baseUrlFromHeaders(request.headers);

  after(async () => {
    await runChunk(run, selfBase);
  });

  // The run is claimed; the work is under way. Progress is read from the run
  // row, which is the only honest source anyway — this response could never
  // describe a chunk that has not happened yet.
  return NextResponse.json({ claimed: 1, runId: run.id, jobKey: run.jobKey, status: "running" });
}

/**
 * One slice of one run, after the response has been sent.
 *
 * Nothing here can return an HTTP status to anybody, so every failure has to
 * land on the run row instead — that row is what the operator is looking at.
 */
async function runChunk(run: JobRun, selfBase: string | null) {
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

    // A chunk that neither finished the run nor advanced it would chain
    // forever, one invocation per second, achieving nothing. Whatever the
    // cause — a handler that cannot make progress, or units so slow that not
    // one fits in a chunk — it needs a person, so it stops here and says so.
    if (!finished && result.processedUnits <= run.processedUnits) {
      return fail(
        `The worker ran for ${Math.round(CHUNK_BUDGET_MS / 1000)}s without completing a single unit ` +
          `(stuck at ${result.processedUnits} of ${run.totalUnits}). Stopping rather than retrying forever.`,
      );
    }

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
    //
    // An unfinished run stays `running` with no lease rather than going back to
    // `queued`. Both are claimable, but only one is true: work is under way and
    // the next chunk is already being asked for. Saying "Waiting to start" at
    // 12 of 230 rows described the queue rather than the job, and it also
    // stopped the page polling, so the bar froze until a manual refresh.
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

    // One line per chunk, so a stalled run can be read off the function log
    // rather than guessed at. Which chunk was the last to print is the whole
    // diagnosis when a chain breaks.
    console.log(
      `[jobs] ${run.jobKey} ${run.id}: ${run.processedUnits} → ${result.processedUnits} of ${run.totalUnits}` +
        ` (${cancelled ? "cancelled" : result.done ? "completed" : "handing over"})`,
    );

    // The handover. Fresh invocation, fresh duration budget, same cursor.
    if (!finished) await triggerJobTick(selfBase ?? undefined);
  } catch (error) {
    // The run keeps the cursor it last wrote, so Execute can pick it up rather
    // than starting over. Nothing retries on a timer — a person decides.
    await fail(error instanceof Error ? error.message : String(error));
  }
}

/** Rejects a browser that wanders onto the URL, rather than 405-ing obscurely. */
export function GET() {
  return NextResponse.json({ error: "POST only." }, { status: 405 });
}
