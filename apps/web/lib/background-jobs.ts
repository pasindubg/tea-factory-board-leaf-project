/**
 * Client-safe identities and contracts for background job runs.
 *
 * Same security shape as the list-resource registry: a job key is not a table
 * or a query, it names an allowlisted job definition owned by the server. The
 * browser only ever sends the compile-time key; the definition decides who may
 * read a run and how it is presented.
 *
 * The runtime that starts, advances and finishes a run is server-only and
 * lives in `background-jobs-server.ts`.
 */

/** Every background job the system can run. Add the key here first. */
export const JOB_KEYS = ["auction.dispatch-import"] as const;

export type JobKey = (typeof JOB_KEYS)[number];

export function isJobKey(value: unknown): value is JobKey {
  return typeof value === "string" && (JOB_KEYS as readonly string[]).includes(value);
}

/**
 * `interrupted` is never stored. It is derived when a run claims to be running
 * but its heartbeat has stopped — the action that owned it is gone (a deploy,
 * a crash), and a progress bar that will never move again is worse than saying
 * so plainly.
 */
export type JobRunStatus = "queued" | "running" | "completed" | "failed" | "interrupted";

/** How a metric or item status is coloured. Presentation belongs to the job
 * definition, never to the stored row. */
export type JobTone = "success" | "info" | "warning" | "danger" | "neutral";

export type JobMetricDef = { key: string; label: string; tone: JobTone };

export type JobDefinition = {
  key: JobKey;
  /** Shown as the run's title while it is in progress. */
  title: string;
  /** What `total_units` counts, for "115 / 230 rows". */
  unit: { one: string; many: string };
  /** Tallies shown as chips, in order. */
  metrics: JobMetricDef[];
  /** Colour for each per-item status the job reports. */
  itemTones: Record<string, JobTone>;
  /** Column heading for an item's reference (a sheet row, a file, a record). */
  itemRefLabel: string;
  /** Item statuses that mean "needs a human" — shown by default. */
  attentionStatuses: string[];
};

export const JOB_DEFINITIONS: Record<JobKey, JobDefinition> = {
  "auction.dispatch-import": {
    key: "auction.dispatch-import",
    title: "Dispatch Schedule import",
    unit: { one: "row", many: "rows" },
    metrics: [
      { key: "imported", label: "Imported", tone: "success" },
      { key: "reprints", label: "Re-prints registered", tone: "info" },
      { key: "skipped", label: "Skipped", tone: "neutral" },
      { key: "failed", label: "Failed", tone: "danger" },
    ],
    itemTones: { imported: "success", reprint: "info", skipped: "neutral", failed: "danger" },
    itemRefLabel: "Sheet row",
    attentionStatuses: ["failed", "skipped"],
  },
};

/** One record the job processed. Deliberately generic: a spreadsheet row, an
 * uploaded file, a supplier — whatever the job iterates. */
export type JobRunItem = {
  /** Where it came from, in the source's own terms ("243", "page 2"). */
  ref: string;
  /** What it is ("0909"). */
  label: string;
  /** Job-defined status; coloured through `itemTones`. */
  status: string;
  detail: string;
};

export type JobRunState = {
  id: string;
  jobKey: JobKey;
  status: JobRunStatus;
  label: string | null;
  totalUnits: number;
  processedUnits: number;
  metrics: Record<string, number>;
  notes: string[];
  items: JobRunItem[];
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

/** Percentage complete, floored at a sliver so a just-started run still shows
 * a bar rather than an empty track. */
export function jobProgressPercent(run: Pick<JobRunState, "totalUnits" | "processedUnits">): number {
  if (run.totalUnits <= 0) return 0;
  return Math.min(100, Math.round((run.processedUnits / run.totalUnits) * 100));
}

export function jobUnitLabel(definition: JobDefinition, count: number): string {
  return count === 1 ? definition.unit.one : definition.unit.many;
}

/** The four display states a run can be in, and how each is coloured. This is
 * the "is it working, did it fail, is it done" attribute the overview shows. */
export const JOB_STATE_CHIPS: Record<JobRunStatus, { label: string; style: string }> = {
  queued: { label: "Waiting to start", style: "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200" },
  running: { label: "In progress", style: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
  completed: { label: "Completed", style: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
  failed: { label: "Error", style: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
  interrupted: { label: "Interrupted", style: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300" },
};

/** Search options for the state column, derived from the same map it renders
 * through so the two cannot drift. */
export function jobStateOptions(): { value: string; label: string }[] {
  return Object.values(JOB_STATE_CHIPS).map((chip) => ({ value: chip.label, label: chip.label }));
}
