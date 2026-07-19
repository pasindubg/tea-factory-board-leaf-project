"use client";

import Link from "next/link";
import { EntityList, EntityListResource, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import type {
  AuctionEligibleBrokerInvoiceListRow,
  AuctionPhysicalDispatchListRow,
  AuctionWarehouseListRow,
} from "@/lib/list-resources";
import { createBundledDispatch } from "../actions";
import { BundledDispatchForm } from "./new/bundled-dispatch-form";

export type PhysicalDispatchListRow = AuctionPhysicalDispatchListRow;

const COLUMNS: EntityListColumn<PhysicalDispatchListRow>[] = [
  {
    key: "dispatchNo",
    label: "Dispatch no.",
    accessor: (row) => row.dispatchNo,
    sortable: true,
    filter: "text",
    lov: false,
    cellClassName: "font-mono font-semibold",
    render: (row) => <Link href={`/dashboard/auction/dispatches/${row.id}`} className="text-green-700 hover:underline dark:text-green-400">{row.dispatchNo}</Link>,
  },
  { key: "dispatchDateFrom", label: "Dispatch from", accessor: (row) => row.dispatchDateFrom, sortable: true, lov: false, searchInput: "date", cellClassName: "tabular-nums" },
  { key: "dispatchDateTo", label: "Dispatch to", accessor: (row) => row.dispatchDateTo, sortable: true, lov: false, searchInput: "date", cellClassName: "tabular-nums" },
  { key: "warehouse", label: "Warehouse", accessor: (row) => row.warehouse, sortable: true, filter: "select" },
  { key: "invoiceCount", label: "Invoices", accessor: (row) => row.invoiceCount, sortable: true, lov: false, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums" },
  {
    key: "status",
    label: "Status",
    accessor: (row) => row.status,
    sortable: true,
    filter: "select",
    render: (row) => <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-300">{row.status}</span>,
  },
];

const LIST = {
  columns: COLUMNS,
  selectionMode: "single",
  add: true,
  edit: false,
  delete: false,
} satisfies ListDefinition<PhysicalDispatchListRow>;

export function DispatchList({
  rows,
  eligibleInvoices,
  warehouses,
  canCreate,
  emptyMessage = "No dispatches have been created yet.",
}: {
  rows: PhysicalDispatchListRow[];
  eligibleInvoices: AuctionEligibleBrokerInvoiceListRow[];
  warehouses: AuctionWarehouseListRow[];
  canCreate: boolean;
  emptyMessage?: string;
}) {
  return (
    <EntityListResource resource={{ key: "auction.eligible-broker-invoices" }} initialRows={eligibleInvoices}>
      {(invoiceData) => (
        <EntityListResource resource={{ key: "auction.warehouses" }} initialRows={warehouses}>
          {(warehouseData) => {
            const hasEligibleInvoices = invoiceData.rows.length >= 2;
            const hasActiveWarehouse = warehouseData.rows.some((warehouse) => warehouse.active);
            const createEnabled = canCreate && hasEligibleInvoices && hasActiveWarehouse;
            const createDisabledReason = !canCreate
              ? "Only owners and managers can create physical dispatches."
              : !hasActiveWarehouse
                ? "Add an active warehouse in Warehouse Basic Data first."
                : !hasEligibleInvoices
                  ? "At least two unbundled Broker Invoices are required."
                  : "Finish or cancel the current dispatch first.";

            return (
              <EntityList
                resource={{ key: "auction.physical-dispatches" }}
                initialRows={rows}
                definition={LIST}
                getId={(row) => row.id}
                rowLabel={(row) => `dispatch ${row.dispatchNo}`}
                title="Physical dispatches"
                description="Review outbound dispatches and bundle eligible Broker Invoices without leaving this list."
                emptyMessage={emptyMessage}
                canCreate={createEnabled}
                create={{
                  action: createBundledDispatch,
                  label: "New dispatch",
                  panelTitle: "Create physical dispatch",
                  disabledReason: createDisabledReason,
                  render: ({ action, close }) => (
                    <BundledDispatchForm
                      invoices={invoiceData.rows}
                      warehouses={warehouseData.rows}
                      action={action}
                      onCancel={close}
                    />
                  ),
                }}
              />
            );
          }}
        </EntityListResource>
      )}
    </EntityListResource>
  );
}
