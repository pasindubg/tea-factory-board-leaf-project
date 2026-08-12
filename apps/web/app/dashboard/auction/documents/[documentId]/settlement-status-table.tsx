"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";

const LKR = (amount: number) => `Rs ${amount.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type SettlementStatus = "settled" | "cash-only" | "under-paid" | "over-paid" | "awaiting" | "unpaid";
const STATUS_STYLE: Record<SettlementStatus, string> = {
  settled: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300",
  "cash-only": "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300",
  "under-paid": "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300",
  "over-paid": "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300",
  awaiting: "bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300",
  unpaid: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300",
};
const STATUS_OPTIONS: SettlementStatus[] = ["settled", "cash-only", "under-paid", "over-paid", "awaiting", "unpaid"];

export type SettlementStatusRow = {
  id: string;
  contractNo: string;
  expected: number;
  cashOnly: number;
  received: number;
  status: SettlementStatus;
  note: string;
};

const COLUMNS: EntityListColumn<SettlementStatusRow>[] = [
  { key: "contractNo", label: "Contract", accessor: (row) => row.contractNo, sortable: true, filter: "text", cellClassName: "font-medium" },
  { key: "expected", label: "Expected", accessor: (row) => row.expected, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => LKR(row.expected) },
  { key: "cashOnly", label: "Cash-only", accessor: (row) => row.cashOnly, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums text-stone-500 dark:text-stone-400", render: (row) => LKR(row.cashOnly) },
  { key: "received", label: "Received", accessor: (row) => row.received, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.received > 0 ? LKR(row.received) : "—" },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select", filterOptions: STATUS_OPTIONS.map((status) => ({ value: status, label: status })), render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[row.status]}`}>{row.status}</span> },
  { key: "note", label: "Note", accessor: (row) => row.note, sortable: true, filter: "text", cellClassName: "text-xs text-stone-500 dark:text-stone-400" },
];

const LIST = { columns: COLUMNS, selectionMode: "single" } satisfies ListDefinition<SettlementStatusRow>;

export function SettlementStatusTable({ rows }: { rows: SettlementStatusRow[] }) {
  return (
    <EntityList
      scope="settlement-status"
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `contract ${row.contractNo}`}
      title="Settlement status"
      description="Contract amounts compared with imported bank credits."
      emptyMessage="No settlements."
    />
  );
}
