"use client";

import type { ReconRow, ReconStatus } from "@tea/api";
import { useListControls, SortButton, FilterCell, type ColumnDef } from "@/components/list-controls";

const STATUS_STYLE: Record<ReconStatus, string> = {
  catalogued: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400",
  shutout: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-400",
  pending: "bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300",
  unexpected: "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-400",
};

const STATUS_OPTIONS: ReconStatus[] = ["catalogued", "shutout", "pending", "unexpected"];

const COLUMNS: ColumnDef<ReconRow>[] = [
  { key: "invoiceNo", label: "Invoice", accessor: (r) => r.invoiceNo, sortable: true, filter: "text" },
  { key: "status", label: "Result", accessor: (r) => r.status, sortable: true, filter: "select", filterOptions: STATUS_OPTIONS.map((s) => ({ value: s, label: s })) },
  { key: "invoiced", label: "Invoiced", accessor: (r) => (r.invoiced ? `${r.invoiced.grade} · ${r.invoiced.netWt.toFixed(2)} kg` : null), sortable: true },
  { key: "lotNo", label: "Lot no.", accessor: (r) => r.ack?.lotNo ?? null, sortable: true, filter: "text" },
  { key: "ack", label: "Catalogued (ack)", accessor: (r) => (r.ack ? `${r.ack.grade} · ${r.ack.netWt.toFixed(2)} kg` : null), sortable: true },
  { key: "weightDelta", label: "Δ net kg", accessor: (r) => r.weightDelta ?? null, sortable: true },
];

export function ReconTable({ rows }: { rows: ReconRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-3 py-3 ${col.key === "weightDelta" ? "text-right" : ""}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
            <th className="px-3 py-3">Notes</th>
          </tr>
          {controls.hasFilters && (
            <tr className="border-b border-stone-100 bg-stone-50/60 dark:border-stone-800 dark:bg-stone-900/40">
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-3 py-1.5 font-normal">
                  <FilterCell col={col} controls={controls} />
                </th>
              ))}
              <th className="px-3 py-1.5"></th>
            </tr>
          )}
        </thead>
        <tbody>
          {visibleRows.map((r) => (
            <tr key={r.invoiceNo} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
              <td className="px-3 py-2 font-medium">{r.invoiceNo}</td>
              <td className="px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              </td>
              <td className="px-3 py-2">
                {r.invoiced ? `${r.invoiced.grade} · ${r.invoiced.netWt.toFixed(2)} kg` : "—"}
              </td>
              <td className="px-3 py-2">{r.ack?.lotNo ?? "—"}</td>
              <td className="px-3 py-2">
                {r.ack ? `${r.ack.grade} · ${r.ack.netWt.toFixed(2)} kg` : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                {r.weightDelta == null ? "—" : `${r.weightDelta > 0 ? "+" : ""}${r.weightDelta.toFixed(2)}`}
              </td>
              <td className="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
                {r.status === "pending" && "Invoiced, not in this ack — may roll to a later sale"}
                {r.status === "unexpected" && "In the acknowledgement but never invoiced"}
                {r.gradeMismatch && <span className="text-amber-700 dark:text-amber-400"> grade differs</span>}
                {r.weightDelta != null && Math.abs(r.weightDelta) > 0.01 && (
                  <span className="text-amber-700 dark:text-amber-400"> weight differs</span>
                )}
              </td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-stone-400 dark:text-stone-500">
                No rows match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
