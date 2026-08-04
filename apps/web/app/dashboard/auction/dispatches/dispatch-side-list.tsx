"use client";

import { DetailSideList } from "@/components/detail-side-list";
import type { ColumnDef } from "@/components/list-controls";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { PhysicalDispatchListRow } from "./dispatch-list";

const COLUMNS: ColumnDef<PhysicalDispatchListRow>[] = [
  { key: "dispatchNo", label: "Dispatch no.", accessor: (row) => row.dispatchNo, sortable: true, filter: "text", lov: false },
  { key: "dispatchDateFrom", label: "Dispatch from", accessor: (row) => row.dispatchDateFrom, sortable: true, lov: false, searchInput: "date" },
  { key: "dispatchDateTo", label: "Dispatch to", accessor: (row) => row.dispatchDateTo, sortable: true, lov: false, searchInput: "date" },
  { key: "warehouse", label: "Warehouse", accessor: (row) => row.warehouse, sortable: true, filter: "select" },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select" },
];

export function DispatchSideList({
  rows,
  currentId,
  searchPanelId,
  onCreate,
  createDisabledReason,
}: {
  rows: PhysicalDispatchListRow[];
  currentId: string;
  searchPanelId: string;
  /** Present only when this rail's detail page owns a create workflow. */
  onCreate?: () => void;
  createDisabledReason?: string;
}) {
  return (
    <DetailSideList
      resource={{ key: "auction.physical-dispatches" }}
      initialRows={rows}
      columns={COLUMNS}
      getId={(row) => row.id}
      rowLabel={(row) => `Dispatch ${row.dispatchNo}`}
      searchPanelId={searchPanelId}
      emptyMessage="No dispatches."
      filteredEmptyMessage="No dispatches match."
      create={onCreate ? {
        // No render/renderRow: the detail page swaps its own main content to
        // the create form on open, exactly like the broker-invoice rail does.
        action: async (): Promise<ListMutationResult> => ({ ok: false, error: "Use the New dispatch form." }),
        disabledReason: createDisabledReason,
        onOpen: onCreate,
      } : undefined}
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
