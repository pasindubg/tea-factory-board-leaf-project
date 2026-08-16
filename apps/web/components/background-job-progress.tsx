"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJobRun } from "@/app/_actions/background-jobs";
import { showAppToast } from "@/components/action-feedback";
import {
  JOB_DEFINITIONS,
  jobProgressPercent,
  jobUnitLabel,
  type JobKey,
  type JobRunState,
  type JobTone,
} from "@/lib/background-jobs";

/**
 * The shared progress + report surface for any background job.
 *
 * A long server action outlives the page that started it, so this component
 * never treats its own request as the source of truth — it reads the run row.
 * That is what lets a refreshed (or entirely different) tab show a moving bar
 * and, when the work ends, the same report the original tab would have shown.
 *
 * A job supplies only its own start form through `children`; everything below
 * is identical for every job, driven by the job's definition.
 */

const TONE_CHIP: Record<JobTone, string> = {
  success: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  info: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  danger: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  neutral: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
};

const POLL_MS = 2000;

/** Where a run is listed, deep-linked so a long history opens on the right row. */
export function backgroundJobHref(runId?: string | null): string {
  return runId ? `/dashboard/blm-cloud/background-jobs?run=${encodeURIComponent(runId)}` : "/dashboard/blm-cloud/background-jobs";
}

/**
 * Announces a started run. The work continues on the server whatever the
 * operator does next, so the toast says it exists and offers the one place it
 * can be watched — rather than implying they must stay on this page.
 */
export function announceJobStarted(runId: string) {
  showAppToast(`Background job created (${runId.slice(0, 8)})`, "success", {
    label: "Go to background job",
    href: backgroundJobHref(runId),
  });
}

export function useJobRun(jobKey: JobKey, initialRun: JobRunState | null) {
  const [run, setRun] = useState<JobRunState | null>(initialRun);

  const refresh = useCallback(async () => {
    const result = await fetchJobRun(jobKey);
    if (result.ok) setRun(result.run);
  }, [jobKey]);

  // Polls only while something is actually running, so an idle page makes no
  // requests at all.
  useEffect(() => {
    if (run?.status !== "running") return;
    const timer = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [run?.status, refresh]);

  return { run, setRun, refresh, running: run?.status === "running" };
}

export function BackgroundJobProgress({
  jobKey,
  run,
  emptyMessage = "Nothing has been run yet.",
}: {
  jobKey: JobKey;
  run: JobRunState | null;
  emptyMessage?: string;
}) {
  const definition = JOB_DEFINITIONS[jobKey];
  const [showAll, setShowAll] = useState(false);

  if (!run) return <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">{emptyMessage}</p>;

  const percent = jobProgressPercent(run);
  const inFlight = run.status === "running";
  const interrupted = run.status === "interrupted";
  const attention = new Set(definition.attentionStatuses);
  const problems = run.items.filter((item) => attention.has(item.status));
  const shown = showAll ? run.items : problems;

  const chips = definition.metrics.map((metric) => (
    <span key={metric.key} className={`rounded-full px-3 py-1 text-sm ${TONE_CHIP[metric.tone]}`}>
      {metric.label}: <strong>{run.metrics[metric.key] ?? 0}</strong>
    </span>
  ));

  return (
    <div className="mt-4 space-y-3">
      {(inFlight || interrupted) && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-stone-800 dark:text-stone-100">
              {inFlight ? definition.title : `${definition.title} — interrupted`}
              {run.label ? ` · ${run.label}` : ""}
            </span>
            <span className="tabular-nums text-stone-600 dark:text-stone-300">
              {run.processedUnits} / {run.totalUnits} {jobUnitLabel(definition, run.totalUnits)} ({percent}%)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${inFlight ? "bg-green-600" : "bg-amber-500"}`}
              style={{ width: `${Math.max(percent, 2)}%` }}
            />
          </div>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {inFlight
              ? "This keeps running if you close or refresh this page — come back any time to see where it got to."
              : "This stopped without finishing (the server restarted, most likely). Work completed before it stopped is saved."}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {chips}
        {run.label && !inFlight && !interrupted && (
          <span className="text-sm text-stone-500 dark:text-stone-400">from {run.label}</span>
        )}
      </div>

      {run.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">{run.error}</p>
      )}

      {run.notes.length > 0 && (
        <div className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-300">
          {run.notes.map((note) => <p key={note}>{note}</p>)}
        </div>
      )}

      {run.items.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
              {showAll ? `All ${run.items.length} ${jobUnitLabel(definition, run.items.length)}` : `${problems.length} needing attention`}
            </p>
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="text-sm text-green-700 hover:underline dark:text-green-400"
            >
              {showAll ? "Show only problems" : "Show everything"}
            </button>
          </div>
          <div className="max-h-96 overflow-auto rounded-md border border-stone-200 dark:border-stone-700">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-stone-100 dark:bg-stone-800">
                <tr>
                  <th className="px-3 py-2 font-medium">{definition.itemRefLabel}</th>
                  <th className="px-3 py-2 font-medium">Record</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={`${item.ref}-${item.label}-${item.status}`} className="border-t border-stone-100 dark:border-stone-800">
                    <td className="px-3 py-1.5 tabular-nums text-stone-500 dark:text-stone-400">{item.ref}</td>
                    <td className="px-3 py-1.5 font-medium">{item.label}</td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${TONE_CHIP[definition.itemTones[item.status] ?? "neutral"]}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-stone-600 dark:text-stone-300">{item.detail}</td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-3 text-stone-500 dark:text-stone-400">Nothing needed attention.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
