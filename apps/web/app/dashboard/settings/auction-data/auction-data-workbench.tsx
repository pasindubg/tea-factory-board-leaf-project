"use client";

import { useState, useTransition } from "react";
import { resetAuctionData, type ResetEntityCount } from "./_actions/reset";
import { importDispatchSheet, type AuctionImportResult, type ImportRowOutcome } from "./_actions/import";

const card = "rounded-lg border border-stone-200 bg-white p-5 dark:border-stone-700 dark:bg-stone-900";
const heading = "text-base font-semibold text-stone-800 dark:text-stone-100";
const muted = "mt-1 text-sm text-stone-500 dark:text-stone-400";
const input = "mt-1 w-full max-w-sm rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800";

const STATUS_STYLE: Record<ImportRowOutcome["status"], string> = {
  imported: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  reprint: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  skipped: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

/**
 * The two stages are separate on purpose and in order: nothing about the
 * import removes data, and nothing about the reset adds any. Running one does
 * not commit the operator to the other.
 */
export function AuctionDataWorkbench({ entities, total }: { entities: ResetEntityCount[]; total: number }) {
  return (
    <div className="space-y-6">
      <ResetStage entities={entities} total={total} />
      <ImportStage />
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

function ImportStage() {
  const [result, setResult] = useState<AuctionImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [showAll, setShowAll] = useState(false);

  const outcomes = result?.ok ? result.outcomes : [];
  const problems = outcomes.filter((row) => row.status === "failed" || row.status === "skipped");
  const shown = showAll ? outcomes : problems;

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
        action={(formData) => startTransition(async () => setResult(await importDispatchSheet(formData)))}
      >
        <input
          type="file"
          name="file"
          required
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="block max-w-md text-sm text-stone-600 file:mr-3 file:rounded-md file:border-0 file:bg-stone-200 file:px-3 file:py-2 file:text-sm file:font-medium dark:text-stone-300 dark:file:bg-stone-700"
        />
        <button
          type="submit"
          disabled={pending}
          className="mt-3 rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
        >
          {pending ? "Importing…" : "Parse and import"}
        </button>
      </form>

      {result && !result.ok && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {result.error}
        </p>
      )}

      {result?.ok && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Chip label="Imported" count={result.imported} style={STATUS_STYLE.imported} />
            <Chip label="Re-prints registered" count={result.reprints} style={STATUS_STYLE.reprint} />
            <Chip label="Skipped" count={result.skipped} style={STATUS_STYLE.skipped} />
            <Chip label="Failed" count={result.failed} style={STATUS_STYLE.failed} />
          </div>
          {(result.gradesAdded.length > 0 || result.aliasesAdded.length > 0) && (
            <div className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-300">
              {result.aliasesAdded.length > 0 && <p>Grade aliases added: {result.aliasesAdded.join(", ")}</p>}
              {result.gradesAdded.length > 0 && <p>New active grades created: {result.gradesAdded.join(", ")}</p>}
            </div>
          )}
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
              {showAll ? `All ${outcomes.length} rows` : `${problems.length} rows needing attention`}
            </p>
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="text-sm text-green-700 hover:underline dark:text-green-400"
            >
              {showAll ? "Show only problems" : "Show every row"}
            </button>
          </div>
          <div className="max-h-96 overflow-auto rounded-md border border-stone-200 dark:border-stone-700">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-stone-100 dark:bg-stone-800">
                <tr>
                  <th className="px-3 py-2 font-medium">Sheet row</th>
                  <th className="px-3 py-2 font-medium">Invoice</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={`${row.sheetRow}-${row.invoiceNo}`} className="border-t border-stone-100 dark:border-stone-800">
                    <td className="px-3 py-1.5 tabular-nums text-stone-500 dark:text-stone-400">{row.sheetRow}</td>
                    <td className="px-3 py-1.5 font-medium">{row.invoiceNo}</td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[row.status]}`}>{row.status}</span>
                    </td>
                    <td className="px-3 py-1.5 text-stone-600 dark:text-stone-300">{row.detail}</td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-3 text-stone-500 dark:text-stone-400">Every row imported cleanly.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Chip({ label, count, style }: { label: string; count: number; style: string }) {
  return <span className={`rounded-full px-3 py-1 ${style}`}>{label}: <strong>{count}</strong></span>;
}
