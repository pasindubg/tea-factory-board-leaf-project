"use client";

import Link from "next/link";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";

export type BySaleRow = {
  id: string;
  saleNo: string;
  targetSaleNo: string | null;
  broker: string;
  status: string;
  statusChip: string;
  lotsCount: number;
  netKg: number;
  proceeds: number | null;
  settlement: number | null;
};

const LKR = (amount: number) => `Rs ${amount.toLocaleString("en-LK", { maximumFractionDigits: 0 })}`;

const COLUMNS: EntityListColumn<BySaleRow>[] = [
  { key: "saleNo", label: "Broker invoice", accessor: (row) => row.saleNo, sortable: true, filter: "text", cellClassName: "font-medium", render: (row) => <Link href={`/dashboard/auction/${row.id}`} className="text-green-700 hover:underline dark:text-green-400">{row.saleNo}</Link> },
  { key: "targetSaleNo", label: "Sale", accessor: (row) => row.targetSaleNo ?? null, sortable: true, filter: "text", cellClassName: "tabular-nums text-stone-600 dark:text-stone-400", render: (row) => row.targetSaleNo || "—" },
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select" },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select", render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${row.statusChip}`}>{row.status}</span> },
  { key: "lotsCount", label: "Lots", accessor: (row) => row.lotsCount, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums" },
  { key: "netKg", label: "Net kg", accessor: (row) => row.netKg, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.netKg.toFixed(2) },
  { key: "proceeds", label: "Proceeds", accessor: (row) => row.proceeds ?? null, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.proceeds != null ? LKR(row.proceeds) : "—" },
  { key: "settlement", label: "Settlement", accessor: (row) => row.settlement ?? null, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.settlement != null ? LKR(row.settlement) : "—" },
];

const LIST = { columns: COLUMNS, selectionMode: "single" } satisfies ListDefinition<BySaleRow>;

export function BySaleTable({ rows }: { rows: BySaleRow[] }) {
  return (
    <EntityList
      scope="auction-by-sale"
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `broker invoice ${row.saleNo}`}
      title="Broker invoices by sale"
      description="Sale progress, proceeds and settlements across broker invoices."
      emptyMessage="No broker invoices."
      filteredEmptyMessage="No sales match these filters."
      rowClassName={() => "hover:bg-stone-50 dark:hover:bg-stone-800/50"}
    />
  );
}
