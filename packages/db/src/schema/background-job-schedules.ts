import { pgTable, uuid, text, jsonb, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { users } from "./users";

// A recurring background job. Each time one comes due the worker inserts an
// ordinary BACKGROUND_JOB_RUNS row for it, so a scheduled run and a run someone
// started by hand are the same thing afterwards — one queue, one overview, one
// set of commands.
export const backgroundJobSchedules = pgTable(
  // Upper case to match BACKGROUND_JOB_RUNS: every SQL reference stays
  // double-quoted and Supabase callers must match the case exactly.
  "BACKGROUND_JOB_SCHEDULES",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    /** Allowlisted job identity, the same keys BACKGROUND_JOB_RUNS uses. */
    jobKey: text("job_key").notNull(),
    /** What the owner calls this schedule in the list. */
    label: text("label"),
    /**
     * When it runs, in a small explicit vocabulary rather than cron syntax:
     * `every 15m`, `every 1h`, `daily 06:00`, `weekly mon 06:00`,
     * `monthly 1 06:00`. Held as text so a real cron parser can replace the
     * evaluator later without a migration.
     */
    spec: text("spec").notNull(),
    /**
     * Evaluated in this zone, never the server's. A schedule that says 06:00
     * means 06:00 in Sri Lanka; the server clock is UTC and must not decide.
     */
    timezone: text("timezone").default("Asia/Colombo").notNull(),
    /** Copied onto every run this schedule creates. */
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    /** Paused rather than deleted, so its history and next run survive. */
    active: boolean("active").default(true).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    /** Computed server-side after each fire. The claim query orders on it. */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_background_job_schedules_factory").on(t.factoryId),
    // The only query the promotion step makes: what is due, everywhere.
    index("idx_background_job_schedules_due").on(t.active, t.nextRunAt),
  ],
);
