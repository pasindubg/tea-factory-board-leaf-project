import { pgTable, uuid, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { users } from "./users";
import { backgroundJobSchedules } from "./background-job-schedules";

// One run of any long-running background job.
//
// A server action that outlives the page that started it needs its progress to
// live somewhere the browser is not: the tab can be refreshed or closed while
// the work continues, and without a persisted run the operator sees an idle
// form while records keep appearing, and never gets the final report.
//
// Deliberately job-agnostic. `job_key` names an allowlisted job definition
// (see apps/web/lib/background-jobs.ts) which owns the labels, units and
// presentation; this table stores only the raw state that any job has:
// how far it got, what it tallied, and what happened to each item.
export const backgroundJobRuns = pgTable(
  // Upper case. PostgreSQL folds unquoted identifiers to lower case, so every
  // SQL reference must stay double-quoted and Supabase callers must match the
  // case exactly (`.from("BACKGROUND_JOB_RUNS")`). Drizzle quotes for us.
  "BACKGROUND_JOB_RUNS",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    // History of who ran what, kept if the user is later removed.
    startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
    /** Allowlisted job identity, e.g. `auction.dispatch-import`. */
    jobKey: text("job_key").notNull(),
    /** What this particular run was over — a filename, a period, a record. */
    label: text("label"),
    // `queued` is where every run now starts: the row is written by the action
    // and picked up by a worker, so nothing depends on the request that created
    // it staying open. `cancelled` is what the Cancel command writes; the
    // overview shows it as "Interrupted" alongside a run whose worker died,
    // because to the operator they are the same event — the column keeps the
    // distinction for diagnosis.
    status: text("status", { enum: ["queued", "running", "completed", "failed", "cancelled"] })
      .default("queued")
      .notNull(),
    /** Progress in whatever unit the job definition names. */
    totalUnits: integer("total_units").default(0).notNull(),
    processedUnits: integer("processed_units").default(0).notNull(),
    /** Job-defined tallies, keyed by the definition's metric keys. */
    metrics: jsonb("metrics").$type<Record<string, number>>().default({}).notNull(),
    /** Free-form notes the run wants to surface (e.g. reference data created). */
    notes: jsonb("notes").$type<string[]>().default([]).notNull(),
    /** Per-item report: `{ ref, label, status, detail }`, written at the end. */
    items: jsonb("items").$type<unknown[]>().default([]).notNull(),
    /** Set only when the whole run failed before finishing. */
    error: text("error"),

    // ---- queue state -------------------------------------------------------

    /**
     * The job's input, resolved by the action that queued it. Holds references,
     * never bytes: an upload becomes a Storage path here, because a worker
     * running minutes later cannot be handed the browser's file.
     */
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    /**
     * Where to carry on from, written by the job's own handler and handed back
     * to it unchanged on the next chunk. Opaque to this table.
     */
    cursor: jsonb("cursor").$type<Record<string, unknown>>().default({}).notNull(),
    /**
     * How many times this run has been picked up. Diagnostic only — nothing
     * fails a run for reaching a number. A run stops when it finishes, when it
     * errors, or when someone cancels it.
     */
    attempts: integer("attempts").default(0).notNull(),
    /**
     * Who holds this run, and until when. The lease is what makes a dead worker
     * recoverable: once it expires the run is claimable again, and the overview
     * can tell a run that is genuinely progressing from one whose worker is gone.
     */
    workerId: text("worker_id"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    /**
     * Earliest moment this run may be claimed. The Execute command sets it to
     * now; a chunk that hands back control sets it to now as well.
     */
    runAfter: timestamp("run_after", { withTimezone: true }).defaultNow().notNull(),
    /**
     * Set by Cancel. The worker checks it between units and stops there, so a
     * cancel takes effect at the next unit boundary rather than mid-write.
     */
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    /** Set when this run was created by a schedule rather than by a person. */
    scheduleId: uuid("schedule_id").references(() => backgroundJobSchedules.id, {
      onDelete: "set null",
    }),
    // All three are timestamptz: `updated_at` is compared against the clock in
    // application code, and a naive timestamp is reinterpreted as machine-local
    // when it becomes a JS Date — which made a brand-new row look hours old.
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    // Touched on every progress write. A run whose heartbeat has stopped was
    // interrupted (a deploy, a crash) — the UI can say so instead of showing a
    // progress bar that will never move again.
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_background_job_runs_factory").on(t.factoryId),
    // The lookup every poll makes: newest run of one job for one factory.
    index("idx_background_job_runs_factory_job_started").on(t.factoryId, t.jobKey, t.startedAt),
    // The only query a worker makes, and it runs across every tenant.
    index("idx_background_job_runs_claim").on(t.status, t.runAfter),
  ],
);
