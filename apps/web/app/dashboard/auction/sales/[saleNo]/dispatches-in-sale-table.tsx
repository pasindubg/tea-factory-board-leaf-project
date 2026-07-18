"use client";

import Link from "next/link";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";

export type DispatchInSaleRow = {
  id: string;
  saleNo: string;
  broker: string;
  dispatchDate: string | null;
  saleDate: string | null;
  lotsCount: number;
  statusChips: { label: string; style: string; count: number }[];
  soldLots: number;
  reprintLots: number;
  statusLabel: string;
  statusStyle: string;
};

const COLUMNS: EntityListColumn<DispatchInSaleRow>[] = [
  { key: "saleNo", label: "Broker invoice no.", accessor: (row) => row.saleNo, sortable: true, filter: "text", lov: false, cellClassName: "font-medium", render: (row) => <Link href={`/dashboard/auction/${row.id}`} className="text-green-700 hover:underline dark:text-green-400">{row.saleNo}</Link> },
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select" },
  { key: "dispatchDate", label: "Invoice date", accessor: (row) => row.dispatchDate ?? null, sortable: true, lov: false, searchInput: "date", cellClassName: "text-stone-600 dark:text-stone-400", render: (row) => row.dispatchDate ?? "—" },
  { key: "saleDate", label: "Sale date", accessor: (row) => row.saleDate ?? null, sortable: true, lov: false, searchInput: "date", cellClassName: "text-stone-600 dark:text-stone-400", render: (row) => row.saleDate ?? "—" },
  { key: "lotsCount", label: "Lots", accessor: (row) => row.lotsCount, sortable: true, lov: false, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums" },
  { key: "statusChips", label: "Lot statuses", render: (row) => <div className="flex flex-wrap gap-1.5">{row.statusChips.map((item) => <span key={item.label} className={`rounded-full px-2 py-0.5 text-xs ${item.style}`}>{item.label}: {item.count}</span>)}</div> },
  { key: "soldLots", label: "Sold", accessor: (row) => row.soldLots, sortable: true, lov: false, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums" },
  { key: "reprintLots", label: "Re-print", accessor: (row) => row.reprintLots, sortable: true, lov: false, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums" },
  { key: "statusLabel", label: "Broker invoice status", accessor: (row) => row.statusLabel, sortable: true, filter: "select", render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${row.statusStyle}`}>{row.statusLabel}</span> },
];

const LIST: ListDefinition<DispatchInSaleRow> = { columns: COLUMNS, selectionMode: "single" };

export function DispatchesInSaleTable({ rows }: { rows: DispatchInSaleRow[] }) {
  return (
    <EntityList
      scope="dispatches-in-sale"
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `broker invoice ${row.saleNo}`}
      title="Broker invoices in sale"
      emptyMessage="No broker invoices are linked to this sale."
      filteredEmptyMessage="No broker invoices match these filters."
    />
  );
}
