"use client";

import { SubmitButton } from "@/components/submit-button";
import { lkr } from "@/lib/money";
import { deleteAdjustment } from "../actions";
import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";

const KIND_LABELS: Record<string, string> = {
  advance: "Advance / loan",
  transport: "Transport",
  water_penalty: "Water penalty",
  other: "Other deduction",
  bonus: "One-off bonus",
};

export type AdjustmentRow = {
  id: string;
  occurredOn: string;
  supplierName: string;
  kind: string;
  label: string | null;
  amount: string | null;
  percent: string | null;
};

const COLUMNS: ColumnDef<AdjustmentRow>[] = [
  { key: "occurredOn", label: "Date", accessor: (r) => r.occurredOn, sortable: true },
  { key: "supplierName", label: "Supplier", accessor: (r) => r.supplierName, sortable: true, filter: "select" },
  { key: "kind", label: "Kind", accessor: (r) => KIND_LABELS[r.kind] ?? r.kind, sortable: true, filter: "select" },
  { key: "label", label: "Detail", accessor: (r) => r.label ?? null, sortable: true, filter: "text" },
  { key: "value", label: "Value", accessor: (r) => (r.percent != null ? Number(r.percent) : Number(r.amount ?? 0)), sortable: true },
];

export function AdjustmentsTable({ rows }: { rows: AdjustmentRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${col.key === "value" ? "text-right" : ""}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((a) => (
            <tr key={a.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
              <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{a.occurredOn}</td>
              <td className="px-4 py-3 font-medium">{a.supplierName}</td>
              <td className="px-4 py-3">{KIND_LABELS[a.kind] ?? a.kind}</td>
              <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{a.label ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {a.percent != null ? `${Number(a.percent).toFixed(2)}%` : lkr(a.amount)}
              </td>
              <td className="px-4 py-3 text-right">
                <form action={deleteAdjustment}>
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton pendingText="…" className="text-sm text-red-700 dark:text-red-400 hover:underline">Remove</SubmitButton>
                </form>
              </td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No adjustments match these filters.</td></tr>
          )}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No advances or deductions recorded.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
