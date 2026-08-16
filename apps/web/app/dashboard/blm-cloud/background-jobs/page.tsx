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
      <h2 className="text-xl font-semibold">Background jobs</h2>
      {/* `?run=` deep-links the run a toast just announced. */}
      <BackgroundJobsTable rows={jobs.rows} highlightRunId={run ?? null} />
    </div>
  );
}
