"use server";

import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES } from "@/lib/roles";
import { isJobKey, type JobRunState } from "@/lib/background-jobs";
import { after } from "next/server";
import { headers } from "next/headers";
import { latestJobRun, markRunInterrupted } from "@/lib/background-jobs-server";
import { baseUrlFromHeaders } from "@/lib/jobs/trigger";
import { claimAndRunChunk } from "@/lib/jobs/worker";

/**
 * The one poll every background-job UI uses.
 *
 * The browser sends a compile-time job key and nothing else — no table, no
 * filter, no tenant id — matching the list-resource contract. The factory is
 * resolved from the session, so a run can only ever be read within its own
 * tenant (and RLS enforces that again underneath).
 *
 * It READS. It does not restart anything: a poll that fired a worker tick on
 * its 2s timer meant thirty invocations a minute at the database and made the
 * whole app crawl. A run is started by the upload and continued by the chunk
 * chain; a dead one is resumed by Execute, deliberately.
 */

/** When a quiet run is reported dead instead of still working. Only ever with
 * a lapsed LEASE too — silence alone is not proof, which is what the old
 * two-minute heartbeat got wrong. */
const DEAD_AFTER_MS = 180_000;

export async function fetchJobRun(jobKey: string): Promise<
  { ok: true; run: JobRunState | null } | { ok: false; error: string }
> {
  if (!isJobKey(jobKey)) return { ok: false, error: "Unknown background job." };
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);
  const result = await latestJobRun(supabase, profile.factory_id, jobKey);

  if (result.ok && result.run) {
    const run = result.run;
    const quietFor = run.updatedAt ? Date.now() - new Date(run.updatedAt).getTime() : Infinity;
    const unheld = !run.leaseUntil || new Date(run.leaseUntil).getTime() < Date.now();
    const claimsToBeWorking = run.status === "queued" || run.status === "running";

    // A killed worker leaves nothing behind to report itself, so the run would
    // claim to be running forever. Marking it is a single write — no worker is
    // started, and the cursor is kept so Execute resumes from it.
    if (claimsToBeWorking && quietFor > DEAD_AFTER_MS && unheld) {
      const message =
        `Interrupted after ${run.processedUnits} of ${run.totalUnits}. ` +
        `The worker stopped without finishing. Use Execute to resume from where it stopped.`;
      await markRunInterrupted(supabase, profile.factory_id, run.id, message);
      return { ok: true, run: { ...run, status: "failed", error: message } };
    }

    // Continues an unheld run IN PROCESS. This is the handover that cannot be
    // refused: no request, no URL, no auth — the same invocation that answered
    // the poll does the next chunk in after(). The claim is atomic, so a herd
    // of polls costs one no-op RPC each; whoever wins holds the lease and the
    // rest claim nothing. While any tab is watching, the job runs on polls
    // alone even if the app can never reach itself over HTTP.
    if (claimsToBeWorking && unheld) {
      const base = baseUrlFromHeaders(await headers());
      after(async () => { await claimAndRunChunk(base); });
    }
  }

  return result;
}
