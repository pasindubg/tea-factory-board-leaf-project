"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ListCommandToolbar,
  ListCreatePanel,
  ListSearchPanel,
  ListSurface,
  SortButton,
  useFrameworkListData,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";
import type {
  AuctionEligibleBrokerInvoiceListRow,
  AuctionPhysicalDispatchListRow,
  AuctionWarehouseListRow,
} from "@/lib/list-resources";
import { createBundledDispatch } from "../actions";
import { BundledDispatchForm } from "./new/bundled-dispatch-form";

export type PhysicalDispatchListRow = AuctionPhysicalDispatchListRow;

const COLUMNS: ColumnDef<PhysicalDispatchListRow>[] = [
  { key: "dispatchNo", label: "Dispatch no.", accessor: (row) => row.dispatchNo, sortable: true, filter: "text", lov: false },
  { key: "dispatchDateFrom", label: "Dispatch from", accessor: (row) => row.dispatchDateFrom, sortable: true, lov: false, searchInput: "date" },
  { key: "dispatchDateTo", label: "Dispatch to", accessor: (row) => row.dispatchDateTo, sortable: true, lov: false, searchInput: "date" },
  { key: "warehouse", label: "Warehouse", accessor: (row) => row.warehouse, sortable: true, filter: "select" },
  { key: "invoiceCount", label: "Invoices", accessor: (row) => row.invoiceCount, sortable: true, lov: false, searchInput: "number" },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select" },
];

const LIST = {
  columns: COLUMNS,
  selectionMode: "single",
  add: true,
  edit: false,
  delete: false,
} satisfies ListDefinition<PhysicalDispatchListRow>;

const RIGHT_ALIGNED = new Set(["invoiceCount"]);

export function DispatchList({
  rows: initialRows,
  eligibleInvoices: initialEligibleInvoices,
  warehouses: initialWarehouses,
  canCreate,
  emptyMessage = "No dispatches have been created yet.",
}: {
  rows: PhysicalDispatchListRow[];
  eligibleInvoices: AuctionEligibleBrokerInvoiceListRow[];
  warehouses: AuctionWarehouseListRow[];
  canCreate: boolean;
  emptyMessage?: string;
}) {
  const [adding, setAdding] = useState(false);
  const dispatchData = useFrameworkListData({
    initialRows,
    resource: { key: "auction.physical-dispatches" },
  });
  // These option resources remain mounted even while the create panel is
  // closed. Their shared subscriptions therefore stay fresh when either the
  // dispatch action or the Warehouse Basic Data list changes them.
  const invoiceData = useFrameworkListData({
    initialRows: initialEligibleInvoices,
    resource: { key: "auction.eligible-broker-invoices" },
  });
  const warehouseData = useFrameworkListData({
    initialRows: initialWarehouses,
    resource: { key: "auction.warehouses" },
  });
  const rows = dispatchData.rows;
  const controls = useListControls(rows, LIST.columns);
  const selection = useListSelection(rows, { mode: LIST.selectionMode, getId: (row) => row.id });
  const visibleRows = controls.rows;
  const hasEligibleInvoices = invoiceData.rows.length >= 2;
  const hasActiveWarehouse = warehouseData.rows.some((warehouse) => warehouse.active);
  const createEnabled = canCreate && hasEligibleInvoices && hasActiveWarehouse && !adding;
  const createDisabledReason = !canCreate
    ? "Only owners and managers can create physical dispatches."
    : !hasActiveWarehouse
      ? "Add an active warehouse in Warehouse Basic Data first."
      : !hasEligibleInvoices
        ? "At least two unbundled Broker Invoices are required."
        : "Finish or cancel the current dispatch first.";

  return (
    <ListSurface
      title="Physical dispatches"
      description="Review outbound dispatches and bundle eligible Broker Invoices without leaving this list."
      onCreate={() => setAdding(true)}
      canCreate={Boolean(LIST.add) && createEnabled}
      createDisabledReason={createDisabledReason}
      createLabel="New dispatch"
      refreshing={dispatchData.refreshing || invoiceData.refreshing || warehouseData.refreshing}
    >
      <ListCommandToolbar mode={LIST.selectionMode} count={selection.selectedCount} />
      <ListCreatePanel open={adding} title="Create physical dispatch">
        <BundledDispatchForm
          invoices={invoiceData.rows}
          warehouses={warehouseData.rows}
          action={dispatchData.mutationAction(createBundledDispatch, {
            onSuccess: () => {
              setAdding(false);
              selection.clear();
            },
          })}
          onCancel={() => setAdding(false)}
        />
      </ListCreatePanel>
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
