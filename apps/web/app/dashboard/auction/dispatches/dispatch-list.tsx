"use client";

import Link from "next/link";
import { ListCommandToolbar, ListSearchPanel, ListSurface, SortButton, useListControls, useListSelection, type ColumnDef, type ListDefinition } from "@/components/list-controls";

export type PhysicalDispatchListRow = {
  id: string;
  dispatchNo: string;
  dispatchDateFrom: string;
  dispatchDateTo: string;
  warehouse: string;
  invoiceCount: number;
  status: string;
};

const COLUMNS: ColumnDef<PhysicalDispatchListRow>[] = [
  { key: "dispatchNo", label: "Dispatch no.", accessor: (row) => row.dispatchNo, sortable: true, filter: "text", lov: false },
  { key: "dispatchDateFrom", label: "Dispatch from", accessor: (row) => row.dispatchDateFrom, sortable: true, lov: false, searchInput: "date" },
  { key: "dispatchDateTo", label: "Dispatch to", accessor: (row) => row.dispatchDateTo, sortable: true, lov: false, searchInput: "date" },
  { key: "warehouse", label: "Warehouse", accessor: (row) => row.warehouse, sortable: true, filter: "select" },
  { key: "invoiceCount", label: "Invoices", accessor: (row) => row.invoiceCount, sortable: true, lov: false, searchInput: "number" },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select" },
];

// Physical dispatches are read-only here. The common list still owns search,
// sorting, and single-row selection; opening the dispatch is an explicit link.
const LIST: ListDefinition<PhysicalDispatchListRow> = {
  columns: COLUMNS,
  selectionMode: "single",
  add: false,
  edit: false,
  delete: false,
};

const RIGHT_ALIGNED = new Set(["invoiceCount"]);

export function DispatchList({ rows, emptyMessage = "No dispatches have been created yet." }: { rows: PhysicalDispatchListRow[]; emptyMessage?: string }) {
  const controls = useListControls(rows, LIST.columns);
  const selection = useListSelection(rows, { mode: LIST.selectionMode ?? "single", getId: (row) => row.id });
  const visibleRows = controls.rows;

  return (
    <ListSurface>
      <ListCommandToolbar mode={LIST.selectionMode ?? "single"} count={selection.selectedCount} />
      <ListSearchPanel columns={LIST.columns} controls={controls} label="Find dispatches" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              {LIST.columns.map((column) => (
                <th key={column.key} className={`px-4 py-3 ${RIGHT_ALIGNED.has(column.key) ? "text-right" : ""}`}>
                  {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((dispatch) => (
              <tr
                key={dispatch.id}
                {...selection.rowProps(dispatch.id)}
                className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(dispatch.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
              >
                <td className="px-4 py-3 font-mono font-semibold">
                  <Link href={`/dashboard/auction/dispatches/${dispatch.id}`} className="text-green-700 hover:underline dark:text-green-400">
                    {dispatch.dispatchNo}
                  </Link>
                </td>
                <td className="px-4 py-3 tabular-nums">{dispatch.dispatchDateFrom}</td>
                <td className="px-4 py-3 tabular-nums">{dispatch.dispatchDateTo}</td>
                <td className="px-4 py-3">{dispatch.warehouse}</td>
                <td className="px-4 py-3 text-right tabular-nums">{dispatch.invoiceCount}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-300">{dispatch.status}</span></td>
              </tr>
            ))}
            {visibleRows.length === 0 && rows.length > 0 && (
              <tr><td colSpan={LIST.columns.length} className="px-4 py-8 text-center text-stone-500 dark:text-stone-400">No dispatches match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">{emptyMessage}</p>}
    </ListSurface>
  );
}
