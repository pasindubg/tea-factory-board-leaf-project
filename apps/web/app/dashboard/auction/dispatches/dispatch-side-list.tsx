"use client";

import Link from "next/link";
import { ListCommandToolbar, ListSearchPanel, ListSidePanel, SortButton, useListControls, useListSelection, type ColumnDef, type ListDefinition } from "@/components/list-controls";
import type { PhysicalDispatchListRow } from "./dispatch-list";

const COLUMNS: ColumnDef<PhysicalDispatchListRow>[] = [
  { key: "dispatchNo", label: "Dispatch no.", accessor: (row) => row.dispatchNo, sortable: true, filter: "text", lov: false },
  { key: "dispatchDateFrom", label: "Dispatch from", accessor: (row) => row.dispatchDateFrom, sortable: true, lov: false, searchInput: "date" },
  { key: "dispatchDateTo", label: "Dispatch to", accessor: (row) => row.dispatchDateTo, sortable: true, lov: false, searchInput: "date" },
  { key: "warehouse", label: "Warehouse", accessor: (row) => row.warehouse, sortable: true, filter: "select" },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select" },
];

const LIST: ListDefinition<PhysicalDispatchListRow> = {
  columns: COLUMNS,
  selectionMode: "single",
  add: false,
  edit: false,
  delete: false,
};

export function DispatchSideList({ rows, currentId }: { rows: PhysicalDispatchListRow[]; currentId: string }) {
  const controls = useListControls(rows, LIST.columns);
  const selection = useListSelection(rows, { mode: LIST.selectionMode ?? "single", getId: (row) => row.id });

  return (
    <ListSidePanel className="xl:sticky xl:top-0 xl:h-[calc(100dvh-8rem)] xl:min-h-[34rem] xl:flex-col">
      <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Dispatches</h3>
          <SortButton col={COLUMNS[0]} controls={controls} />
        </div>
      </div>
      <ListCommandToolbar mode={LIST.selectionMode ?? "single"} count={selection.selectedCount} />
      <ListSearchPanel columns={LIST.columns} controls={controls} label="Find dispatches" />
      <div className="max-h-[28rem] overflow-y-auto xl:max-h-none xl:min-h-0 xl:flex-1">
        {controls.rows.map((dispatch) => {
          const active = dispatch.id === currentId;
          return (
            <Link
              key={dispatch.id}
              href={`/dashboard/auction/dispatches/${dispatch.id}`}
              onClick={() => selection.select(dispatch.id)}
              aria-current={active ? "page" : undefined}
              className={`block border-b border-stone-100 px-4 py-3 text-sm last:border-0 dark:border-stone-800 ${
                active
                  ? "bg-green-50 text-green-950 dark:bg-green-950 dark:text-green-100"
                  : "hover:bg-stone-50 dark:hover:bg-stone-800/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono font-semibold tabular-nums text-green-700 dark:text-green-400">{dispatch.dispatchNo}</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-700 dark:bg-stone-800 dark:text-stone-300">{dispatch.status}</span>
              </div>
              <p className="mt-1 tabular-nums text-xs text-stone-500 dark:text-stone-400">{dispatch.dispatchDateFrom}{dispatch.dispatchDateFrom === dispatch.dispatchDateTo ? "" : ` – ${dispatch.dispatchDateTo}`}</p>
              <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{dispatch.warehouse} · {dispatch.invoiceCount} invoice{dispatch.invoiceCount === 1 ? "" : "s"}</p>
            </Link>
          );
        })}
        {controls.rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500">No dispatches match.</p>}
      </div>
    </ListSidePanel>
  );
}
