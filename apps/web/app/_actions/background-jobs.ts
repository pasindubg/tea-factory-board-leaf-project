"use server";

import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES } from "@/lib/roles";
import { isJobKey, type JobRunState } from "@/lib/background-jobs";
import { latestJobRun } from "@/lib/background-jobs-server";

/**
 * The one poll every background-job UI uses.
 *
 * The browser sends a compile-time job key and nothing else — no table, no
 * filter, no tenant id — matching the list-resource contract. The factory is
 * resolved from the session, so a run can only ever be read within its own
 * tenant (and RLS enforces that again underneath).
 */
export async function fetchJobRun(jobKey: string): Promise<
  { ok: true; run: JobRunState | null } | { ok: false; error: string }
> {
  if (!isJobKey(jobKey)) return { ok: false, error: "Unknown background job." };
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);
  return latestJobRun(supabase, profile.factory_id, jobKey);
}
