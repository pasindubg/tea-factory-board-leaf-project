"use client";

import type { ReconRow, ReconStatus } from "@tea/api";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";

/**
 * What the row is SHOWN as. Two of these are not reconciliation statuses:
 * recon ① compares only against the lots invoiced in this sale group, so a lot
 * carried forward from an earlier broker invoice lands in `unexpected` there
 * and is resolved afterwards (see resolveAckCarryForward). Displaying it as
 * `unexpected` would leave the operator unable to tell a registered re-print
 * from tea the broker catalogued that the factory has no record of.
 */
export type ReconDisplayStatus = ReconStatus | "re-print" | "rolled forward";

export type ReviewReconRow = ReconRow & {
  display: ReconDisplayStatus;
  /** Why the row is no longer unexpected, in the operator's words. */
  carryForwardNote: string | null;
};

const STATUS_STYLE: Record<ReconDisplayStatus, string> = {
  catalogued: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400",
  shutout: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-400",
  pending: "bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300",
  unexpected: "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-400",
  "re-print": "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-300",
  "rolled forward": "bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-300",
};

const STATUS_OPTIONS: ReconDisplayStatus[] = ["catalogued", "shutout", "pending", "unexpected", "re-print", "rolled forward"];

const COLUMNS: EntityListColumn<ReviewReconRow>[] = [
  { key: "invoiceNo", label: "Invoice", accessor: (row) => row.invoiceNo, sortable: true, filter: "text", cellClassName: "font-medium" },
  { key: "status", label: "Result", accessor: (row) => row.display, sortable: true, filter: "select", filterOptions: STATUS_OPTIONS.map((status) => ({ value: status, label: status })), minWidth: 150, render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[row.display]}`}>{row.display}</span> },
  { key: "invoiced", label: "Invoiced", accessor: (row) => row.invoiced ? `${row.invoiced.grade} · ${row.invoiced.netWt.toFixed(2)} kg` : null, sortable: true, render: (row) => row.invoiced ? `${row.invoiced.grade} · ${row.invoiced.netWt.toFixed(2)} kg` : "—" },
  { key: "lotNo", label: "Lot no.", accessor: (row) => row.ack?.lotNo ?? null, sortable: true, filter: "text", render: (row) => row.ack?.lotNo ?? "—" },
  { key: "ack", label: "Catalogued (ack)", accessor: (row) => row.ack ? `${row.ack.grade} · ${row.ack.netWt.toFixed(2)} kg` : null, sortable: true, render: (row) => row.ack ? `${row.ack.grade} · ${row.ack.netWt.toFixed(2)} kg` : "—" },
  { key: "weightDelta", label: "Δ net kg", accessor: (row) => row.weightDelta ?? null, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => row.weightDelta == null ? "—" : `${row.weightDelta > 0 ? "+" : ""}${row.weightDelta.toFixed(2)}` },
  { key: "notes", label: "Notes", accessor: (row) => reconciliationNotes(row), filter: "text", lov: false, cellClassName: "text-xs text-stone-500 dark:text-stone-400", render: reconciliationNotes },
];

const LIST = { columns: COLUMNS, selectionMode: "single" } satisfies ListDefinition<ReviewReconRow>;

export function ReconTable({ rows, warningInvoiceNos = [] }: { rows: ReviewReconRow[]; warningInvoiceNos?: string[] }) {
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

function reconciliationNotes(row: ReviewReconRow) {
  const notes = [
    row.carryForwardNote ?? "",
    row.display === "pending" ? "Invoiced, not in this ack — may roll to a later sale" : "",
    row.display === "unexpected" && !row.carryForwardNote ? "In the acknowledgement but never invoiced" : "",
    row.gradeMismatch ? "grade differs" : "",
    row.weightDelta != null && Math.abs(row.weightDelta) > 0.01 ? "weight differs" : "",
  ].filter(Boolean);
  return notes.join(" · ") || "—";
}
