import { pgTable, uuid, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { users } from "./users";

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
    status: text("status", { enum: ["running", "completed", "failed"] })
      .default("running")
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
  ],
);
