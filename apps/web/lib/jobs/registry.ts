import "server-only";

import type { JobClient } from "@/lib/jobs/auth";
import type { JobKey, JobRunItem } from "@/lib/background-jobs";
import { runDispatchImportChunk } from "@/lib/jobs/handlers/dispatch-import";

/**
 * What a background job actually does, and the contract it runs under.
 *
 * Same shape as the list-resource registry: the browser only ever names a job
 * by an allowlisted key, and the server owns everything that key means. A
 * handler is registered here once and the worker treats every job identically
 * afterwards — there is no per-job endpoint and no per-job scheduling.
 */

/** One claimed run, as the worker reads it. */
export type JobRun = {
  id: string;
  factoryId: string;
  startedBy: string | null;
  jobKey: JobKey;
  label: string | null;
  totalUnits: number;
  processedUnits: number;
  metrics: Record<string, number>;
  payload: Record<string, unknown>;
  cursor: Record<string, unknown>;
};

export type JobChunkContext = {
  run: JobRun;
  /**
   * The run's own user, as an ordinary Supabase client with RLS enforced. The
   * only route to tenant data a handler is given — there is deliberately no
   * unscoped client in this context.
   */
  supabase: JobClient;
  /**
   * Epoch ms to stop by. A handler checks this between units and returns what
   * it has done; the worker writes the cursor and the next tick carries on.
   * Ignoring it means the function is killed mid-unit instead.
   */
  deadline: number;
  /**
   * True once somebody has pressed Cancel. Checked between units for the same
   * reason as the deadline — stopping at a unit boundary leaves a coherent
   * cursor, stopping mid-write does not.
   */
  cancelled: () => Promise<boolean>;
  /** Publishes progress mid-chunk — without it a run that fits in one chunk
   * jumps 0% straight to complete. Writes the cursor too, so a death mid-chunk
   * re-applies fewer units. */
  reportProgress: (progress: {
    cursor: Record<string, unknown>;
    processedUnits: number;
    metrics: Record<string, number>;
  }) => Promise<void>;
};

export type JobChunkResult = {
  /** Handed back untouched on the next chunk. Opaque to the worker. */
  cursor: Record<string, unknown>;
  /** Absolute, not a delta — the count of units finished across all chunks. */
  processedUnits: number;
  metrics: Record<string, number>;
  /** Appended to the run's report, not replacing it. */
  items?: JobRunItem[];
  /** False means "claim me again"; true finishes the run. */
  done: boolean;
};

export type JobHandler = (context: JobChunkContext) => Promise<JobChunkResult>;

/**
 * Every job the worker can run.
 *
 * A handler MUST be resumable: given a cursor, it continues without repeating
 * units it already applied. This is the contract's most important clause —
 * repeating a unit in the dispatch import means a duplicate invoice, and the
 * worker will hand back the same cursor after any interruption.
 *
 * Empty until a job is ported to run under this worker. A run whose key has no
 * handler is failed with that reason rather than left claimed, so it shows up
 * on the overview instead of disappearing.
 */
export const JOB_HANDLERS: Partial<Record<JobKey, JobHandler>> = {
  "auction.dispatch-import": runDispatchImportChunk,
};
