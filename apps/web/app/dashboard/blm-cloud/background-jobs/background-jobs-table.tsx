"use client";

import { EntityList, type EntityListColumn, type EntityListCommand, type EntityListDelete } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import type { BackgroundJobListRow } from "@/lib/list-resources";
import { jobStateOptions } from "@/lib/background-jobs";
import { cancelBackgroundJobs, deleteBackgroundJobs, executeBackgroundJobs } from "./_actions/commands";

const COLUMNS: EntityListColumn<BackgroundJobListRow>[] = [
  { key: "jobTitle", label: "Job", accessor: (row) => row.jobTitle, sortable: true, filter: "select", cellClassName: "font-medium" },
  { key: "label", label: "Ran over", accessor: (row) => row.label ?? null, sortable: true, filter: "text", render: (row) => row.label ?? "—" },
  // The "is it working, did it fail, is it done" attribute.
  {
    key: "stateLabel",
    label: "State",
    accessor: (row) => row.stateLabel,
    sortable: true,
    filter: "select",
    filterOptions: jobStateOptions(),
    minWidth: 150,
    render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${row.stateStyle}`}>{row.stateLabel}</span>,
  },
  {
    key: "progressLabel",
    label: "Progress",
    accessor: (row) => row.progressLabel,
    sortable: true,
    filter: "text",
    minWidth: 190,
    render: (row) => (
      <div className="min-w-40">
        <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
          <span>{row.progressLabel}</span>
          <span className="text-stone-500 dark:text-stone-400">{row.percent}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
          <div
            className={`h-full rounded-full ${
              row.stateLabel === "In progress" ? "bg-blue-500"
                : row.stateLabel === "Completed" ? "bg-green-600"
                : row.stateLabel === "Error" ? "bg-red-500" : "bg-amber-500"
            }`}
            style={{ width: `${Math.max(row.percent, 2)}%` }}
          />
        </div>
      </div>
    ),
  },
  { key: "summary", label: "Result", accessor: (row) => row.summary, filter: "text", cellClassName: "text-xs text-stone-500 dark:text-stone-400", minWidth: 220 },
  { key: "startedBy", label: "Started by", accessor: (row) => row.startedBy ?? null, sortable: true, filter: "select", render: (row) => row.startedBy ?? "—" },
  { key: "startedAt", label: "Started", accessor: (row) => row.startedAt ?? null, sortable: true, searchInput: "date", cellClassName: "tabular-nums text-xs", render: (row) => row.startedAt ? new Date(row.startedAt).toLocaleString() : "—" },
  { key: "durationLabel", label: "Duration", accessor: (row) => row.durationLabel, sortable: true, lov: false, headerClassName: "text-right", cellClassName: "text-right tabular-nums" },
  { key: "error", label: "Error", accessor: (row) => row.error ?? null, filter: "text", cellClassName: "text-xs text-red-700 dark:text-red-400", render: (row) => row.error ?? "—" },
];

/**
 * What the operator can do to a run, and why these three are enough.
 *
 * Between them they replace every clock this page used to need. Nothing is
 * abandoned after N minutes and nothing is failed for taking too long, because
 * a run that has gone wrong is visible here and can be stopped here.
 *
 * All three take a selection rather than a row, so a page full of runs from a
 * bad afternoon can be cleared in one go.
 */
const COMMANDS: EntityListCommand<BackgroundJobListRow>[] = [
  {
    id: "execute",
    label: "Execute",
    pendingLabel: "Starting…",
    disabled: ({ selectedRows }) =>
      selectedRows.length === 0 || selectedRows.some((row) => row.state === "running"),
    disabledReason: ({ selectedRows }) =>
      selectedRows.length === 0
        ? "Select a job to run."
        : selectedRows.some((row) => row.state === "running")
          ? "A job already in progress must be cancelled before it can be run again."
          : undefined,
    confirm: {
      title: "Run from the beginning?",
      description: ({ selectedRows }) =>
        `${selectedRows.length} job${selectedRows.length === 1 ? "" : "s"} will start again from the beginning. Any progress already recorded is cleared.`,
      confirmLabel: "Run",
    },
    run: ({ selectedRows, clearSelection }) =>
      executeBackgroundJobs(selectedRows.map((row) => row.id)).then((result) => {
        if (result.ok) clearSelection();
        return result;
      }),
  },
  {
    id: "cancel",
    label: "Cancel",
    pendingLabel: "Cancelling…",
    destructive: true,
    disabled: ({ selectedRows }) =>
      selectedRows.length === 0 || !selectedRows.some((row) => row.state === "running" || row.state === "queued"),
    disabledReason: ({ selectedRows }) =>
      selectedRows.length === 0 ? "Select a job to cancel." : "Those jobs have already finished.",
    confirm: {
      title: "Stop these jobs?",
      description: ({ selectedRows }) =>
        `${selectedRows.length} job${selectedRows.length === 1 ? "" : "s"} will stop where they are and show as Interrupted. Work already applied is not undone.`,
      confirmLabel: "Stop",
    },
    run: ({ selectedRows, clearSelection }) =>
      cancelBackgroundJobs(selectedRows.map((row) => row.id)).then((result) => {
        if (result.ok) clearSelection();
        return result;
      }),
  },
];

/**
 * Delete is the framework's own, not a command of ours: `delete: true` puts the
 * standard bin in the toolbar where it sits on every other list, with the same
 * confirmation and the same permission check. A hand-rolled Delete button would
 * have looked and behaved almost like it, which is worse than not having one.
 */
const DELETE: EntityListDelete<BackgroundJobListRow> = {
  action: (ids) => deleteBackgroundJobs(ids),
  disabled: (rows) => rows.some((row) => row.state === "running" || row.state === "queued"),
  disabledReason: (rows) =>
    rows.some((row) => row.state === "running" || row.state === "queued")
      ? "Cancel a job before removing it from the history."
      : undefined,
  title: (count) => `Delete ${count} run${count === 1 ? "" : "s"}?`,
  description: (rows) =>
    `${rows.length} run${rows.length === 1 ? "" : "s"} will be removed from the history, along with their per-item reports. What each run did is not undone.`,
  confirmLabel: "Delete",
};

// `selectionMode` defaults to "single", so multi-select has to be asked for.
// Runs are exactly the case the framework's default multi-select is meant for:
// a page full of them from one bad afternoon, cleared in a single action.
const LIST: ListDefinition<BackgroundJobListRow> = {
  columns: COLUMNS,
  selectionMode: "multi",
  delete: true,
};

// No polling. The list used to re-read itself every few seconds while anything
// was running, which moved rows and cleared selections under whoever was
// reading them. Re-reading is now the operator's decision, taken with the
// refresh control the frame gives every list.
export function BackgroundJobsTable({
  rows,
  highlightRunId,
}: {
  rows: BackgroundJobListRow[];
  highlightRunId: string | null;
}) {
  return (
    <EntityList
      initialRows={rows}
      resource={{ key: "framework.background-jobs" }}
      title=""
      description=""
      definition={LIST}
      commands={COMMANDS}
      deleteAction={DELETE}
      getId={(row) => row.id}
      rowLabel={(row) => `${row.jobTitle}${row.label ? ` — ${row.label}` : ""}`}
      // The run a toast linked to is pulled out of a long history.
      rowClassName={(row) => row.id === highlightRunId
        ? "bg-green-50 ring-1 ring-inset ring-green-400 dark:bg-green-950/40 dark:ring-green-700"
        : ""}
      emptyMessage="No background jobs have been run yet."
      filteredEmptyMessage="No background jobs match these filters."
    />
  );
}
