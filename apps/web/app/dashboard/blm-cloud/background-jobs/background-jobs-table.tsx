"use client";

import { useEffect, useState } from "react";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import type { BackgroundJobListRow } from "@/lib/list-resources";
import { jobStateOptions } from "@/lib/background-jobs";

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

const LIST: ListDefinition<BackgroundJobListRow> = { columns: COLUMNS, selectionMode: "single" };

const REFRESH_MS = 5000;

export function BackgroundJobsTable({
  rows,
  highlightRunId,
}: {
  rows: BackgroundJobListRow[];
  highlightRunId: string | null;
}) {
  const [tick, setTick] = useState(0);
  const anyRunning = rows.some((row) => row.stateLabel === "In progress");

  // A running job's row is stale the moment it renders, so the list re-reads
  // itself while anything is in flight — and stops entirely once nothing is.
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => setTick((value) => value + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, [anyRunning]);

  return (
    <EntityList
      key={tick}
      initialRows={rows}
      resource={{ key: "framework.background-jobs" }}
      definition={LIST}
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
