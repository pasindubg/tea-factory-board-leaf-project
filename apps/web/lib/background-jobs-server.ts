import "server-only";

import { friendlyError } from "@/lib/errors";
import { isJobKey, type JobKey, type JobRunItem, type JobRunState } from "@/lib/background-jobs";
import type { requireProfile } from "@/lib/profile";

/**
 * Server-side runtime for background job runs.
 *
 * A long server action outlives the page that started it: the tab can be
 * refreshed or closed while the work continues. Holding progress only in the
 * browser therefore loses it — the operator watches an idle form while records
 * keep appearing, and never sees the final report. A run row is the fix, and
 * this is the one place that writes it, so every job behaves identically.
 *
 * Tenant scoping comes from the caller's own gate: every function takes the
 * scoped client and factory id, never a browser-supplied one.
 */

type Supa = Awaited<ReturnType<typeof requireProfile>>["supabase"];


// Upper case, and PostgREST matches it exactly — do not lower-case this.
const TABLE = "BACKGROUND_JOB_RUNS";
const COLUMNS =
  "id, job_key, label, status, total_units, processed_units, metrics, notes, items, error, started_at, updated_at, finished_at";

export type JobRunHandle = { runId: string; jobKey: JobKey };

/**
 * Queues a run.
 *
 * `queued`, not `running`: the row is the request the caller makes, and a
 * worker picks it up. That is the whole difference between work that dies with
 * the request that started it and work that does not — the action returns as
 * soon as this row exists, and nothing it does afterwards matters to the job.
 *
 * `payload` is the job's input, and must be self-contained: the worker reads it
 * minutes later in another process, so anything the handler needs has to be in
 * here rather than in a closure or an upload buffer.
 */
export async function startJobRun(
  supabase: Supa,
  factoryId: string,
  input: {
    jobKey: JobKey;
    startedBy?: string | null;
    label?: string | null;
    totalUnits: number;
    metrics?: Record<string, number>;
    notes?: string[];
    payload?: Record<string, unknown>;
    items?: JobRunItem[];
  },
): Promise<{ ok: true; handle: JobRunHandle } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      factory_id: factoryId,
      started_by: input.startedBy ?? null,
      job_key: input.jobKey,
      label: input.label ?? null,
      status: "queued",
      total_units: input.totalUnits,
      metrics: input.metrics ?? {},
      notes: input.notes ?? [],
      payload: input.payload ?? {},
      items: input.items ?? [],
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: friendlyError(error ?? { message: "Could not start the job run." }) };
  return { ok: true, handle: { runId: data.id as string, jobKey: input.jobKey } };
}

/**
 * Advances a run. `updated_at` is the heartbeat that separates "still working"
 * from "the process died", so every progress write must touch it.
 *
 * Call this every few units rather than every one: the operator needs a bar
 * that moves, not a database write per record.
 */
export async function updateJobProgress(
  supabase: Supa,
  factoryId: string,
  handle: JobRunHandle,
  progress: { processedUnits: number; metrics?: Record<string, number> },
): Promise<void> {
  await supabase
    .from(TABLE)
    .update({
      processed_units: progress.processedUnits,
      ...(progress.metrics ? { metrics: progress.metrics } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", handle.runId)
    .eq("factory_id", factoryId);
}

/** Closes a run and stores its report. */
export async function finishJobRun(
  supabase: Supa,
  factoryId: string,
  handle: JobRunHandle,
  result: { status: "completed" | "failed"; processedUnits?: number; metrics?: Record<string, number>; notes?: string[]; items?: JobRunItem[]; error?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from(TABLE)
    .update({
      status: result.status,
      ...(result.processedUnits != null ? { processed_units: result.processedUnits } : {}),
      ...(result.metrics ? { metrics: result.metrics } : {}),
      ...(result.notes ? { notes: result.notes } : {}),
      ...(result.items ? { items: result.items } : {}),
      error: result.error ?? null,
      updated_at: now,
      finished_at: now,
    })
    .eq("id", handle.runId)
    .eq("factory_id", factoryId);
}

function toRunState(row: Record<string, unknown>): JobRunState {
  const status = row.status as "queued" | "running" | "completed" | "failed" | "cancelled";
  return {
    id: row.id as string,
    jobKey: row.job_key as JobKey,
    // No clock. A run used to be relabelled "interrupted" once its heartbeat
    // had been quiet for two minutes, which was a guess, and a wrong one for
    // any job whose units are slow — a single invoice chain can outlast it, and
    // the page then reported work as dead while it was still writing rows.
    //
    // A run is now exactly what it says it is. The one that really did die is
    // resolved by a person: it is visible on the overview and Cancel ends it,
    // which is the trade that made removing every time limit here possible.
    status: status === "cancelled" ? "interrupted" : status,
    label: (row.label as string | null) ?? null,
    totalUnits: Number(row.total_units ?? 0),
    processedUnits: Number(row.processed_units ?? 0),
    metrics: (row.metrics as Record<string, number> | null) ?? {},
    notes: (row.notes as string[] | null) ?? [],
    items: (row.items as JobRunItem[] | null) ?? [],
    error: (row.error as string | null) ?? null,
    startedAt: (row.started_at as string | null) ?? null,
    finishedAt: (row.finished_at as string | null) ?? null,
  };
}

/** The newest run of one job for this factory — what a freshly opened tab
 * shows, and what a poll re-reads. */
export async function latestJobRun(
  supabase: Supa,
  factoryId: string,
  jobKey: string,
): Promise<{ ok: true; run: JobRunState | null } | { ok: false; error: string }> {
  // The key is compile-time on the client, but validate anyway: this is the
  // only value a browser contributes to the query.
  if (!isJobKey(jobKey)) return { ok: false, error: "Unknown background job." };
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq("factory_id", factoryId)
    .eq("job_key", jobKey)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, run: data ? toRunState(data as Record<string, unknown>) : null };
}

/** Whether a job is already working, so a second run cannot be stacked on it. */
export async function jobIsRunning(supabase: Supa, factoryId: string, jobKey: JobKey): Promise<boolean> {
  const latest = await latestJobRun(supabase, factoryId, jobKey);
  return latest.ok && latest.run?.status === "running";
}
