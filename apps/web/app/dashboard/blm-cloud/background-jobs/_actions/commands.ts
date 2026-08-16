"use server";

import { requirePagePermission } from "@/lib/profile";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";

/**
 * The three commands the overview offers over a run.
 *
 * They exist so nothing has to be governed by a clock. A job is not abandoned
 * after some number of minutes and not failed for exceeding a limit — it runs
 * until it finishes, until it errors, or until somebody here stops it. That is
 * only a safe trade because every run is visible on this page and every run can
 * be acted on from it.
 *
 * Every statement is scoped by factory_id as well as id. RLS already enforces
 * that, but a command that takes ids from the browser states the tenant itself
 * rather than trusting the row it was handed.
 */

const TABLE = "BACKGROUND_JOB_RUNS";

/** Reasonable ceiling on a single toolbar action. */
const MAX_IDS = 200;

function checkIds(ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one job.";
  if (ids.length > MAX_IDS) return `Select ${MAX_IDS} jobs or fewer.`;
  return null;
}

const invalidate = [{ kind: "all" as const, key: "framework.background-jobs" as const }];

/**
 * Queue the selected runs to start again from the beginning.
 *
 * Deliberately from the beginning and not from where they stopped: an operator
 * reaching for Execute on a job that went wrong wants a clean run, and a resume
 * that silently skipped the first half would be impossible to reason about
 * afterwards. The progress, tallies and per-item report are cleared with it, so
 * what the row ends up showing describes this run and not a mixture of two.
 */
export async function executeBackgroundJobs(ids: string[]): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("background-jobs", "update");
  const invalid = checkIds(ids);
  if (invalid) return { ok: false, error: invalid };

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "queued",
      cursor: {},
      processed_units: 0,
      metrics: {},
      items: [],
      error: null,
      // A previous cancellation must not survive, or the run would be skipped
      // by the claim the moment it was queued.
      cancel_requested_at: null,
      cancelled_by: null,
      finished_at: null,
      lease_until: null,
      worker_id: null,
      started_by: profile.id,
      started_at: new Date().toISOString(),
      run_after: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("factory_id", profile.factory_id)
    .in("id", ids)
    // A run being worked on right now is not restartable — cancel it first, or
    // two workers would apply the same units.
    .neq("status", "running")
    .select("id");
  if (error) return { ok: false, error: friendlyError(error) };

  const count = data?.length ?? 0;
  if (count === 0) return { ok: false, error: "Nothing to start. A job already in progress must be cancelled first." };
  return { ok: true, notice: `${count} job${count === 1 ? "" : "s"} queued to run.`, invalidate };
}

/**
 * Stop the selected runs.
 *
 * Two things happen at once, and both are needed. The status is set now so the
 * overview reflects the decision immediately rather than waiting on a worker
 * that may be mid-chunk or gone. `cancel_requested_at` is the flag a live
 * worker reads between units and stops on, and it is also what keeps the claim
 * from picking the run up again in the meantime.
 *
 * The row stores `cancelled`; the overview renders it as Interrupted, next to
 * runs whose worker died. To the operator those are the same event — work that
 * did not finish — and the stored value keeps them apart for diagnosis.
 */
export async function cancelBackgroundJobs(ids: string[]): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("background-jobs", "update");
  const invalid = checkIds(ids);
  if (invalid) return { ok: false, error: invalid };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "cancelled",
      cancel_requested_at: now,
      cancelled_by: profile.id,
      finished_at: now,
      lease_until: null,
      updated_at: now,
    })
    .eq("factory_id", profile.factory_id)
    .in("id", ids)
    // Only work that has not already reached an outcome.
    .in("status", ["queued", "running"])
    .select("id");
  if (error) return { ok: false, error: friendlyError(error) };

  const count = data?.length ?? 0;
  if (count === 0) return { ok: false, error: "Nothing to cancel. Those jobs have already finished." };
  return { ok: true, notice: `${count} job${count === 1 ? "" : "s"} cancelled.`, invalidate };
}

/**
 * Remove the selected runs from the history.
 *
 * A run in progress is never deleted — the worker would keep writing progress
 * to a row that no longer exists, and its output would vanish mid-flight with
 * no record that it ever ran. Cancel it first; then it can go.
 */
export async function deleteBackgroundJobs(ids: string[]): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("background-jobs", "delete");
  const invalid = checkIds(ids);
  if (invalid) return { ok: false, error: invalid };

  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq("factory_id", profile.factory_id)
    .in("id", ids)
    .not("status", "in", "(running,queued)")
    .select("id");
  if (error) return { ok: false, error: friendlyError(error) };

  const count = data?.length ?? 0;
  if (count === 0) return { ok: false, error: "Nothing deleted. Cancel a job before removing it." };
  return { ok: true, notice: `${count} job${count === 1 ? "" : "s"} deleted.`, invalidate };
}
