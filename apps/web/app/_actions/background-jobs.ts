"use server";

import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES } from "@/lib/roles";
import { isJobKey, type JobRunState } from "@/lib/background-jobs";
import { latestJobRun, markRunInterrupted } from "@/lib/background-jobs-server";
import { triggerJobTick } from "@/lib/jobs/trigger";

/**
 * The one poll every background-job UI uses.
 *
 * The browser sends a compile-time job key and nothing else — no table, no
 * filter, no tenant id — matching the list-resource contract. The factory is
 * resolved from the session, so a run can only ever be read within its own
 * tenant (and RLS enforces that again underneath).
 */

/**
 * How quiet a run has to go before this restarts it.
 *
 * A healthy chunk writes its heartbeat every few units — roughly every 20s at
 * production speed — so silence for this long means the chain is broken, not
 * that the work is slow.
 */
const STALLED_AFTER_MS = 30_000;

/**
 * How long before a quiet run is declared dead rather than merely restarted.
 *
 * Only ever applied to a run whose LEASE has also lapsed, which is the part
 * that makes it safe: a live worker holds a lease for the whole of its chunk,
 * so a lapsed lease proves no worker has this run. Silence alone would not —
 * that is the guess the old two-minute heartbeat made, and it declared slow
 * work dead.
 */
const DEAD_AFTER_MS = 180_000;

export async function fetchJobRun(jobKey: string): Promise<
  { ok: true; run: JobRunState | null } | { ok: false; error: string }
> {
  if (!isJobKey(jobKey)) return { ok: false, error: "Unknown background job." };
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);
  const result = await latestJobRun(supabase, profile.factory_id, jobKey);

  // Restarts a run whose chain has broken.
  //
  // Chunks hand over to each other by HTTP, so the chain is only as durable as
  // its weakest invocation: one that is killed mid-chunk — a timeout, a cold
  // start, a deploy landing on it — never writes a cursor and never calls its
  // successor. The run then sits at "In progress" forever, because on Hobby the
  // cron that would collect it does not fire again until tomorrow. That is
  // exactly how an import stopped at 61 of 230.
  //
  // Nudging is safe to do freely: the claim only takes a run whose lease has
  // lapsed, so a tick fired while a chunk is genuinely working claims nothing
  // and costs one no-op invocation.
  if (result.ok && result.run) {
    const run = result.run;
    const quietFor = run.updatedAt ? Date.now() - new Date(run.updatedAt).getTime() : Infinity;
    const unheld = !run.leaseUntil || new Date(run.leaseUntil).getTime() < Date.now();
    const claimsToBeWorking = run.status === "queued" || run.status === "running";

    if (claimsToBeWorking && quietFor > DEAD_AFTER_MS && unheld) {
      // Restarting has already been tried on every poll for three minutes and
      // has not moved it. Say so, rather than showing a bar that will never
      // move again — the cursor is kept, so Execute resumes from here.
      const message =
        `Interrupted after ${run.processedUnits} of ${run.totalUnits}. ` +
        `The worker stopped without finishing and did not restart. Use Execute to resume from where it stopped.`;
      await markRunInterrupted(supabase, profile.factory_id, run.id, message);
      return { ok: true, run: { ...run, status: "failed", error: message } };
    }

    if (claimsToBeWorking && quietFor > STALLED_AFTER_MS) {
      void triggerJobTick();
    }
  }

  return result;
}
