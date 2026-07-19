"use client";

import type { ReconRow, ReconStatus } from "@tea/api";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";

const STATUS_STYLE: Record<ReconStatus, string> = {
  catalogued: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400",
  shutout: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-400",
  pending: "bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300",
  unexpected: "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-400",
};

const STATUS_OPTIONS: ReconStatus[] = ["catalogued", "shutout", "pending", "unexpected"];

const COLUMNS: EntityListColumn<ReconRow>[] = [
  { key: "invoiceNo", label: "Invoice", accessor: (row) => row.invoiceNo, sortable: true, filter: "text", cellClassName: "font-medium" },
  { key: "status", label: "Result", accessor: (row) => row.status, sortable: true, filter: "select", filterOptions: STATUS_OPTIONS.map((status) => ({ value: status, label: status })), render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[row.status]}`}>{row.status}</span> },
  { key: "invoiced", label: "Invoiced", accessor: (row) => row.invoiced ? `${row.invoiced.grade} · ${row.invoiced.netWt.toFixed(2)} kg` : null, sortable: true, render: (row) => row.invoiced ? `${row.invoiced.grade} · ${row.invoiced.netWt.toFixed(2)} kg` : "—" },
  { key: "lotNo", label: "Lot no.", accessor: (row) => row.ack?.lotNo ?? null, sortable: true, filter: "text", render: (row) => row.ack?.lotNo ?? "—" },
  { key: "ack", label: "Catalogued (ack)", accessor: (row) => row.ack ? `${row.ack.grade} · ${row.ack.netWt.toFixed(2)} kg` : null, sortable: true, render: (row) => row.ack ? `${row.ack.grade} · ${row.ack.netWt.toFixed(2)} kg` : "—" },
  { key: "weightDelta", label: "Δ net kg", accessor: (row) => row.weightDelta ?? null, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => row.weightDelta == null ? "—" : `${row.weightDelta > 0 ? "+" : ""}${row.weightDelta.toFixed(2)}` },
  { key: "notes", label: "Notes", accessor: (row) => reconciliationNotes(row), filter: "text", lov: false, cellClassName: "text-xs text-stone-500 dark:text-stone-400", render: reconciliationNotes },
];

const LIST = { columns: COLUMNS, selectionMode: "single" } satisfies ListDefinition<ReconRow>;

export function ReconTable({ rows, warningInvoiceNos = [] }: { rows: ReconRow[]; warningInvoiceNos?: string[] }) {
  const warningInvoices = new Set(warningInvoiceNos);

  return (
    <EntityList
      scope="acknowledgement-reconciliation"
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.invoiceNo}
      rowLabel={(row) => `invoice ${row.invoiceNo}`}
      title="Acknowledgement reconciliation"
      description="Invoiced lots compared with the staged broker acknowledgement."
      emptyMessage="No acknowledgement rows."
      rowClassName={(row) => warningInvoices.has(row.invoiceNo) ? "bg-amber-50/80 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/30 dark:ring-amber-700" : ""}
    />
  );
}

function reconciliationNotes(row: ReconRow) {
  const notes = [
    row.status === "pending" ? "Invoiced, not in this ack — may roll to a later sale" : "",
    row.status === "unexpected" ? "In the acknowledgement but never invoiced" : "",
    row.gradeMismatch ? "grade differs" : "",
    row.weightDelta != null && Math.abs(row.weightDelta) > 0.01 ? "weight differs" : "",
  ].filter(Boolean);
  return notes.join(" · ") || "—";
}
