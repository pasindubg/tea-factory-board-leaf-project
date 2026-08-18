"use server";

import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES } from "@/lib/roles";
import { isJobKey, type JobRunState } from "@/lib/background-jobs";
import { latestJobRun, markRunInterrupted } from "@/lib/background-jobs-server";
import { after } from "next/server";
import { headers } from "next/headers";
import { baseUrlFromHeaders, triggerJobTick } from "@/lib/jobs/trigger";

/**
 * The one poll every background-job UI uses.
 *
 * The browser sends a compile-time job key and nothing else — no table, no
 * filter, no tenant id — matching the list-resource contract. The factory is
 * resolved from the session, so a run can only ever be read within its own
 * tenant (and RLS enforces that again underneath).
 */

/** A healthy chunk writes its heartbeat every few units, so silence this long
 * means the chain is broken rather than the work being slow. */
const STALLED_AFTER_MS = 30_000;

/** When a quiet run is declared dead instead of restarted. Only ever applied
 * with a lapsed LEASE too — silence alone is not proof, which is what the old
 * two-minute heartbeat got wrong. */
const DEAD_AFTER_MS = 180_000;

export async function fetchJobRun(jobKey: string): Promise<
  { ok: true; run: JobRunState | null } | { ok: false; error: string }
> {
  if (!isJobKey(jobKey)) return { ok: false, error: "Unknown background job." };
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);
  const result = await latestJobRun(supabase, profile.factory_id, jobKey);

  // Restarts a run whose chain has broken. Chunks hand over by HTTP, so one
  // invocation killed mid-chunk never writes a cursor and never calls its
  // successor — and on Hobby nothing else ticks until tomorrow. Nudging is free
  // when wrong: the claim only takes a run whose lease has lapsed.
  if (result.ok && result.run) {
    const run = result.run;
    const quietFor = run.updatedAt ? Date.now() - new Date(run.updatedAt).getTime() : Infinity;
    const unheld = !run.leaseUntil || new Date(run.leaseUntil).getTime() < Date.now();
    const claimsToBeWorking = run.status === "queued" || run.status === "running";

    if (claimsToBeWorking && quietFor > DEAD_AFTER_MS && unheld) {
      // Three minutes of nudging has not moved it. Say so rather than show a
      // bar that will never move. The cursor is kept, so Execute resumes.
      const message =
        `Interrupted after ${run.processedUnits} of ${run.totalUnits}. ` +
        `The worker stopped without finishing and did not restart. Use Execute to resume from where it stopped.`;
      await markRunInterrupted(supabase, profile.factory_id, run.id, message);
      return { ok: true, run: { ...run, status: "failed", error: message } };
    }

    if (claimsToBeWorking && quietFor > STALLED_AFTER_MS) {
      // after(), same reason as the upload: an un-awaited fetch dies with the
      // instance.
      const base = baseUrlFromHeaders(await headers());
      after(async () => { await triggerJobTick(base ?? undefined); });
    }
  }

  return result;
}
