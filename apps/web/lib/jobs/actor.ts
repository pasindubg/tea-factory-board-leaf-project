import "server-only";

import { withTenantDataScope } from "@/lib/tenant-data";
import { readProfile } from "@/lib/profile";
import { createJobClient } from "@/lib/jobs/auth";
import type { JobActor } from "@/lib/jobs/context";

/**
 * Builds the actor a run executes as, from the user who started it.
 *
 * Deliberately re-reads the profile at claim time rather than storing it on the
 * run. A job that started days ago must not carry rights its owner has since
 * lost: deactivate the user, or narrow their role, and the next chunk stops.
 * That is also why the failure cases are returned as text — the worker records
 * them on the run, where somebody will see them, instead of redirecting a
 * browser that is not there.
 */
export async function buildJobActor(
  userId: string,
): Promise<{ actor: JobActor; error: null } | { actor: null; error: string }> {
  const supabase = createJobClient(userId);
  const loaded = await readProfile(supabase, userId);

  if (!loaded.profile) {
    if (loaded.reason === "no_profile") {
      return { actor: null, error: "The user who started this job no longer has a profile." };
    }
    if (loaded.reason === "deactivated") {
      return { actor: null, error: "The user who started this job has been deactivated." };
    }
    return { actor: null, error: loaded.reason };
  }

  return {
    actor: {
      // The same scoping every request gets, so a handler cannot reach outside
      // the factory even before RLS is consulted.
      supabase: withTenantDataScope(supabase, {
        factoryId: loaded.profile.factory_id,
        actorUserId: loaded.profile.id,
      }) as JobActor["supabase"],
      profile: loaded.profile,
    },
    error: null,
  };
}
