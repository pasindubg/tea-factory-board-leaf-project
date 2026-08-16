"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { resetAuctionData, type ResetEntityCount } from "./_actions/reset";
import { importDispatchSheet } from "./_actions/import";
import { announceJobStarted, BackgroundJobProgress, useJobRun } from "@/components/background-job-progress";
import { showAppToast } from "@/components/action-feedback";
import type { JobRunState } from "@/lib/background-jobs";

/** This page's job in the background-job framework. */
const JOB_KEY = "auction.dispatch-import" as const;

const card = "rounded-lg border border-stone-200 bg-white p-5 dark:border-stone-700 dark:bg-stone-900";
const heading = "text-base font-semibold text-stone-800 dark:text-stone-100";
const muted = "mt-1 text-sm text-stone-500 dark:text-stone-400";
const input = "mt-1 w-full max-w-sm rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800";

/**
 * The two stages are separate on purpose and in order: nothing about the
 * import removes data, and nothing about the reset adds any. Running one does
 * not commit the operator to the other.
 */
export function AuctionDataWorkbench({
  entities,
  total,
  initialRun,
}: {
  entities: ResetEntityCount[];
  total: number;
  initialRun: JobRunState | null;
}) {
  return (
    <div className="space-y-6">
      <ResetStage entities={entities} total={total} />
      <ImportStage initialRun={initialRun} />
    </div>
  );
}

function ResetStage({ entities, total }: { entities: ResetEntityCount[]; total: number }) {
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<{ deleted: ResetEntityCount[]; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // The count is what makes the confirmation meaningful — "delete 1,284 rows"
  // is a decision, "delete everything" is a shrug.
  return (
    <section className={card}>
      <h3 className={heading}>Stage 1 — delete existing auction data</h3>
      <p className={muted}>
        Removes every auction transaction below. Brokers, marks, grades, warehouses, invoice number
        prefixes and broker rate cards are <strong>kept</strong> — the import needs them.
      </p>

      <table className="mt-4 w-full max-w-xl text-sm">
        <tbody>
          {entities.map((entity) => (
            <tr key={entity.table} className="border-b border-stone-100 last:border-0 dark:border-stone-800">
              <td className="py-1.5 text-stone-600 dark:text-stone-300">{entity.label}</td>
              <td className="py-1.5 text-right tabular-nums font-medium text-stone-800 dark:text-stone-200">
                {entity.count.toLocaleString()}
              </td>
            </tr>
          ))}
          <tr className="border-t border-stone-300 dark:border-stone-600">
            <td className="py-1.5 font-semibold text-stone-800 dark:text-stone-100">Total rows</td>
            <td className="py-1.5 text-right tabular-nums font-semibold text-stone-800 dark:text-stone-100">
              {total.toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>

      <form
        className="mt-4"
        action={(formData) => startTransition(async () => {
          const outcome = await resetAuctionData(formData);
          setResult(outcome.ok ? { deleted: outcome.deleted } : { deleted: outcome.deleted, error: outcome.error });
          setConfirmation("");
          // Reported as well as shown. The table below is the detail, but a
          // destructive action has to announce itself, and the toast is also
          // what tells the page the work is over — this form never changes
          // route, and its button stays disabled afterwards (nothing left to
          // delete), so nothing else would release the click.
          if (outcome.ok) {
            const rows = outcome.deleted.reduce((sum, entity) => sum + entity.count, 0);
            showAppToast(`Auction data deleted — ${rows.toLocaleString()} rows removed.`);
          } else {
            showAppToast(outcome.error ?? "Could not delete the auction data.", "error");
          }
        })}
      >
        <label className="block text-sm font-medium text-stone-700 dark:text-stone-200">
          Type <span className="font-mono font-semibold">DELETE</span> to confirm
          <input
            name="confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            placeholder="DELETE"
            className={input}
          />
        </label>
        <button
          type="submit"
          disabled={confirmation !== "DELETE" || pending || total === 0}
          className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Deleting…" : `Delete ${total.toLocaleString()} rows`}
        </button>
        {total === 0 && <p className={muted}>There is no auction data to delete.</p>}
      </form>

      {result && (
        <div className="mt-4 rounded-md bg-stone-50 p-3 text-sm dark:bg-stone-800">
          {result.error && <p className="mb-2 font-medium text-red-700 dark:text-red-400">{result.error}</p>}
          <p className="font-medium text-stone-800 dark:text-stone-100">Deleted:</p>
          <ul className="mt-1 space-y-0.5">
            {result.deleted.map((entity) => (
              <li key={entity.table} className="text-stone-600 dark:text-stone-300">
                {entity.label}: <span className="tabular-nums">{entity.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p className={muted}>Refresh the page to see the new counts.</p>
        </div>
      )}
    </section>
  );
}

/**
 * The job's own start form; everything after it — progress bar, tallies, the
 * per-row report — is the shared BackgroundJobProgress surface, so a new
 * background job needs only its form and a job definition.
 */
function ImportStage({ initialRun }: { initialRun: JobRunState | null }) {
  const { run, refresh, running } = useJobRun(JOB_KEY, initialRun);
  const [startError, setStartError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className={card}>
      <h3 className={heading}>Stage 2 — import the Dispatch Schedule</h3>
      <p className={muted}>
        Upload the workbook. Its <span className="font-mono">Dispatch Schedule</span> sheet is read and
        each row entered through the normal flow. Grade spellings that mean an existing grade are added
        as aliases; genuinely new ones are created as active grades.
      </p>

      <form
        className="mt-4"
        action={(formData) => startTransition(async () => {
          setStartError(null);
          // Poll while our own request is in flight too, so the bar moves for
          // the tab that started it exactly as it does for any other.
          const ticker = setInterval(() => { void refresh(); }, 2000);
          const result = await importDispatchSheet(formData);
          clearInterval(ticker);
          // Both outcomes report. Success already toasted through
          // announceJobStarted; a failure that only set startError left the
          // click with nothing to end it.
          if (!result.ok) {
            setStartError(result.error);
            showAppToast(result.error, "error");
          } else announceJobStarted(result.runId);
          await refresh();
        })}
      >
        <input
          type="file"
          name="file"
          required
          disabled={running || pending}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="block max-w-md text-sm text-stone-600 file:mr-3 file:rounded-md file:border-0 file:bg-stone-200 file:px-3 file:py-2 file:text-sm file:font-medium disabled:opacity-50 dark:text-stone-300 dark:file:bg-stone-700"
        />
        <button
          type="submit"
          disabled={pending || running}
          className="mt-3 rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
        >
          {running ? "Import in progress…" : pending ? "Importing…" : "Parse and import"}
        </button>
      </form>

      {startError && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">{startError}</p>
      )}

      <BackgroundJobProgress jobKey={JOB_KEY} run={run} emptyMessage="No import has been run yet." />
    </section>
  );
}
