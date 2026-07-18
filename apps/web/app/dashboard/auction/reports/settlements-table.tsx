"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";

export type SettlementRow = {
  id: string;
  contractNo: string;
  dispatchNo: string;
  saleNo: string;
  broker: string;
  proceeds: number;
  deductions: number;
  netProceeds: number;
  outputVat: number;
  totalNet: number;
  credited: number;
  remaining: number;
  settled: boolean;
};

const fmt = (n: number) => n.toLocaleString("en-LK", { minimumFractionDigits: 2 });

const COLUMNS: EntityListColumn<SettlementRow>[] = [
  { key: "contractNo", label: "Contract", accessor: (row) => row.contractNo, sortable: true, filter: "text", cellClassName: "font-medium" },
  { key: "dispatchNo", label: "Broker invoice", accessor: (row) => row.dispatchNo, sortable: true, filter: "text" },
  { key: "saleNo", label: "Sale", accessor: (row) => row.saleNo, sortable: true, filter: "text" },
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select" },
  { key: "proceeds", label: "Proceeds", accessor: (row) => row.proceeds, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => fmt(row.proceeds) },
  { key: "deductions", label: "Deductions", accessor: (row) => row.deductions, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => fmt(row.deductions) },
  { key: "netProceeds", label: "Net proceeds", accessor: (row) => row.netProceeds, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => fmt(row.netProceeds) },
  { key: "outputVat", label: "Output VAT", accessor: (row) => row.outputVat, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => fmt(row.outputVat) },
  { key: "totalNet", label: "Total net", accessor: (row) => row.totalNet, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => fmt(row.totalNet) },
  { key: "credited", label: "Credited", accessor: (row) => row.credited, sortable: true, headerClassName: "text-right", cellClassName: "text-right text-green-700 dark:text-green-400", render: (row) => fmt(row.credited) },
  { key: "remaining", label: "Remaining", accessor: (row) => row.remaining, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => <span className={row.settled ? "text-stone-400 dark:text-stone-500" : "font-medium text-amber-700 dark:text-amber-400"}>{fmt(row.remaining)}</span> },
  { key: "settled", label: "Settled", accessor: (row) => row.settled ? "Settled" : "Pending", sortable: true, filter: "select", filterOptions: [{ value: "Settled", label: "Settled" }, { value: "Pending", label: "Pending" }], render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${row.settled ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-400"}`}>{row.settled ? "Settled" : "Pending"}</span> },
];

const LIST = { columns: COLUMNS, selectionMode: "single", add: false, edit: false, delete: false } satisfies ListDefinition<SettlementRow>;

export function SettlementsTable({ rows }: { rows: SettlementRow[] }) {
  return (
    <EntityList
      scope="auction-settlements"
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `contract ${row.contractNo}`}
      title="Settlements"
      description="Expected proceeds matched against received broker credits."
      emptyMessage="No settlements yet — upload a sellers contract from the Upload & review documents tab."
      filteredEmptyMessage="No settlements match these filters."
      className="mt-4"
    />
  );
}
