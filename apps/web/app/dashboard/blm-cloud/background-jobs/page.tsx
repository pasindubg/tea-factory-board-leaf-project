import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { BackgroundJobsTable } from "./background-jobs-table";

/**
 * Every long-running job this factory has started — what is working now, what
 * finished, and what failed.
 *
 * Framework-level rather than per-module: one table backs every job, so one
 * overview serves all of them. A job started anywhere in the app lands here.
 */
export default async function BackgroundJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  await requirePageAccess("background-jobs");
  const { run } = await searchParams;
  const jobs = await loadListResource({ key: "framework.background-jobs" });
  if (!jobs.ok) throw new Error(jobs.error);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Background jobs</h2>
        <p className="mt-1 max-w-3xl text-sm text-stone-500 dark:text-stone-400">
          Long-running work continues on the server after the page that started it is closed or
          refreshed. Each run is recorded here with its progress and outcome.
        </p>
      </div>
      {/* `?run=` deep-links the run a toast just announced. */}
      <BackgroundJobsTable rows={jobs.rows} highlightRunId={run ?? null} />
    </div>
  );
}
