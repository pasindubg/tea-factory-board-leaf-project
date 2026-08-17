import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { Profile } from "@/lib/profile";
import type { JobClient } from "@/lib/jobs/auth";

/**
 * Who the code thinks it is while a background job runs.
 *
 * Every access gate in lib/profile.ts funnels through one function,
 * resolveProfile(), which reads a session cookie and calls
 * supabase.auth.getUser(). That is correct for a request and wrong for a job in
 * two expensive ways: the import paid several auth round trips PER ROW, because
 * each nested action re-gates; and signing out made the next gate call
 * redirect("/login"), which throws, which killed the import mid-loop and left
 * the run stuck at whatever row it had reached.
 *
 * Rather than thread a context argument through three action chains and every
 * function they call, the worker installs the actor here and resolveProfile
 * reads it first. The actions stay exactly as they are — same gates, same role
 * checks, same code path the Invoice Overview page uses, which was the whole
 * point of the import reusing them. They simply stop asking a cookie who is
 * calling.
 *
 * The store is only ever populated by the worker (app/api/jobs/tick), so an
 * ordinary request cannot be inside one. AsyncLocalStorage keeps it attached
 * across every await in the handler without being visible to anything else.
 */

export type JobActor = { supabase: JobClient; profile: Profile };

const storage = new AsyncLocalStorage<JobActor>();

/** Runs `fn` with every access gate resolving to this actor. */
export function runAsJobActor<T>(actor: JobActor, fn: () => Promise<T>): Promise<T> {
  return storage.run(actor, fn);
}

/** The actor a job installed, or undefined in an ordinary request. */
export function currentJobActor(): JobActor | undefined {
  return storage.getStore();
}
