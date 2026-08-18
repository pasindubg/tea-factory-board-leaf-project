import { after, NextResponse } from "next/server";
import { getJobsEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildJobActor } from "@/lib/jobs/actor";
import { runAsJobActor } from "@/lib/jobs/context";
import { baseUrlFromHeaders, triggerJobTick } from "@/lib/jobs/trigger";
import { JOB_HANDLERS, type JobRun } from "@/lib/jobs/registry";
import { isJobKey, type JobKey } from "@/lib/background-jobs";

/**
 * The worker: claims one run, does a slice, hands over to the next invocation.
 *
 * A chunk always leaves a cursor behind, so any death costs only the units
 * since the last write. There is no limit on a JOB — the chunk yield is what
 * makes an unbounded job out of bounded invocations.
 *
 * It responds BEFORE it works because the handover is an HTTP call to itself:
 * working first would make every tick hold a connection open across its
 * successor's whole chunk, nested, until the platform killed the stack.
 *
 * Triggered by the action that queued the run (lib/jobs/trigger.ts). The cron
 * in vercel.json is only a backstop — Hobby caps it at once a day. Execute on
 * the Background jobs page is the real recovery path.
 */

// Node, not Edge: minting a token uses node:crypto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// No maxDuration export on purpose: it can only shorten things. Hobby's
// default and maximum are both 300s (fluid compute), so declaring 60 cut every
// chunk to a fifth. If chunks come back short, check Settings > Functions >
// Default Max Duration.

/** Where a chunk yields, of the 300s available. Checked between units, so the
 * 60s left over covers one slow unit plus the writes and the handover. */
const CHUNK_BUDGET_MS = 240_000;

/** Must exceed a whole chunk, or a slow chunk has its run stolen and units are
 * applied twice. */
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

  // Admin is for the claim ONLY — that one call is cross-tenant by nature. All
  // tenant work below runs as the run's own user, with RLS enforcing it.
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

  // Read now: inside after() the response has gone and request APIs are no
  // longer dependable, but the chain needs a URL.
  const selfBase = baseUrlFromHeaders(request.headers);

  after(async () => {
    await runChunk(run, selfBase);
  });

  // Progress is read from the run row; this response cannot describe a chunk
  // that has not happened yet.
  return NextResponse.json({ claimed: 1, runId: run.id, jobKey: run.jobKey, status: "running" });
}

/** One slice, after the response. No HTTP status can reach anybody from here,
 * so every failure lands on the run row instead. */
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

    // The handover. Fresh invocation, fresh duration budget, same cursor.
    if (!finished) await triggerJobTick(selfBase ?? undefined);
  } catch (error) {
    // The cursor survives, so Execute resumes. Nothing retries on a timer.
    await fail(error instanceof Error ? error.message : String(error));
  }
}

/** Rejects a browser that wanders onto the URL, rather than 405-ing obscurely. */
export function GET() {
  return NextResponse.json({ error: "POST only." }, { status: 405 });
}
