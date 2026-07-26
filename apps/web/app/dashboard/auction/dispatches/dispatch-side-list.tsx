"use client";

import { EntityList } from "@/components/entity-list";
import type { ColumnDef, ListDefinition } from "@/components/list-controls";
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

export function DispatchSideList({ rows, currentId, searchPanelId }: {
  rows: PhysicalDispatchListRow[]; currentId: string; searchPanelId: string;
}) {
  return (
    <EntityList
      // Registry-backed, not a local list: applying a search re-executes a real
      // query (and "Show more" pages) instead of filtering rows already in the
      // browser — which also means locked criteria are enforced on every search,
      // not just on the first render.
      resource={{ key: "auction.physical-dispatches" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `Dispatch ${row.dispatchNo}`}
      chrome="records-only"
      searchPanelId={searchPanelId}
      className="h-full min-h-0 xl:flex-col"
      emptyMessage="No dispatches."
      filteredEmptyMessage="No dispatches match."
      sideList={{
        href: (dispatch) => `/dashboard/auction/dispatches/${dispatch.id}`,
        isActive: (dispatch) => dispatch.id === currentId,
        sortColumnKey: "dispatchNo",
        searchLabel: "Find dispatches",
        content: (dispatch) => (
          <>
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono font-semibold tabular-nums text-green-700 dark:text-green-400">{dispatch.dispatchNo}</span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-700 dark:bg-stone-800 dark:text-stone-300">{dispatch.status}</span>
            </div>
            <p className="mt-1 tabular-nums text-xs text-stone-500 dark:text-stone-400">{dispatch.dispatchDateFrom}{dispatch.dispatchDateFrom === dispatch.dispatchDateTo ? "" : ` – ${dispatch.dispatchDateTo}`}</p>
            <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{dispatch.warehouse} · {dispatch.invoiceCount} invoice{dispatch.invoiceCount === 1 ? "" : "s"}</p>
          </>
        ),
      }}
    />
  );
}
