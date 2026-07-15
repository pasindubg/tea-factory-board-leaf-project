"use client";

import {
  ListCommandToolbar,
  ListSearchPanel,
  ListSurface,
  SortButton,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";

export type WorkflowAuditRow = {
  action: string;
  detail: string;
  reason: string | null;
  actor: string;
  confidenceShown: number | null;
  createdAt: string;
};

type AuditListRow = WorkflowAuditRow & { id: string };

const COLUMNS: ColumnDef<AuditListRow>[] = [
  { key: "action", label: "Action", accessor: (row) => row.action, sortable: true, filter: "select" },
  { key: "detail", label: "Detail", accessor: (row) => row.detail, sortable: true, filter: "text", lov: false },
  { key: "reason", label: "Reason", accessor: (row) => row.reason, sortable: true, filter: "text", lov: false },
  { key: "confidence", label: "Confidence shown", accessor: (row) => row.confidenceShown == null ? null : Math.round(row.confidenceShown * 100), sortable: true, lov: false, searchInput: "number" },
  { key: "actor", label: "Actor", accessor: (row) => row.actor, sortable: true, filter: "select" },
  { key: "createdAt", label: "Recorded", accessor: (row) => row.createdAt, sortable: true, searchInput: "date" },
];

const LIST: ListDefinition<AuditListRow> = {
  columns: COLUMNS,
  selectionMode: "single",
};

export function WorkflowAuditList({
  rows,
  title = "Decision audit",
  description = "Select and search recorded workflow decisions.",
}: {
  rows: WorkflowAuditRow[];
  title?: string;
  description?: string;
}) {
  const listRows: AuditListRow[] = rows.map((row, index) => ({
    ...row,
    id: `${row.createdAt}:${row.action}:${index}`,
  }));
  const controls = useListControls(listRows, LIST.columns);
  const selection = useListSelection(listRows, {
    mode: LIST.selectionMode ?? "single",
    getId: (row) => row.id,
  });

  return (
    <ListSurface title={title} description={description}>
      <ListCommandToolbar mode={LIST.selectionMode ?? "single"} count={selection.selectedCount} />
      <ListSearchPanel columns={LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              {LIST.columns.map((column) => (
                <th key={column.key} className="px-4 py-3">
                  {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {controls.rows.map((row) => (
              <tr
                key={row.id}
                {...selection.rowProps(row.id)}
                className={`cursor-pointer border-b border-stone-100 align-top last:border-0 dark:border-stone-800 ${selection.isSelected(row.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
              >
                <td className="whitespace-nowrap px-4 py-3 font-medium text-stone-800 dark:text-stone-100">{row.action}</td>
                <td className="min-w-64 px-4 py-3 text-stone-600 dark:text-stone-300">{row.detail}</td>
                <td className="min-w-48 px-4 py-3 text-stone-500 dark:text-stone-400">{row.reason ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{row.confidenceShown == null ? "—" : `${Math.round(row.confidenceShown * 100)}%`}</td>
                <td className="whitespace-nowrap px-4 py-3">{row.actor}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-stone-500 dark:text-stone-400">{new Date(row.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {controls.rows.length === 0 && rows.length > 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No audit entries match the current search.</td></tr>
            )}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No decisions recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </ListSurface>
  );
}
