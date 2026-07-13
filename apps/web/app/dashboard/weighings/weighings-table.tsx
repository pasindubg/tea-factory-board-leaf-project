"use client";

import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";

export type WeighingRow = {
  id: string;
  collectedAt: string;
  supplierName: string;
  collectorName: string;
  weightKg: number;
  notes: string | null;
};

const COLUMNS: ColumnDef<WeighingRow>[] = [
  { key: "collectedAt", label: "Time", accessor: (r) => r.collectedAt, sortable: true },
  { key: "supplierName", label: "Supplier", accessor: (r) => r.supplierName, sortable: true, filter: "select" },
  { key: "collectorName", label: "Collector", accessor: (r) => r.collectorName, sortable: true, filter: "select" },
  { key: "weightKg", label: "Weight (kg)", accessor: (r) => r.weightKg, sortable: true },
  { key: "notes", label: "Notes", accessor: (r) => r.notes ?? null, sortable: true, filter: "text" },
];

export function WeighingsTable({ rows }: { rows: WeighingRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${col.key === "weightKg" ? "text-right" : ""}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((w) => (
            <tr key={w.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
              <td className="px-4 py-3">
                {new Date(w.collectedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="px-4 py-3 font-medium">{w.supplierName}</td>
              <td className="px-4 py-3">{w.collectorName}</td>
              <td className="px-4 py-3 text-right tabular-nums">{w.weightKg.toFixed(2)}</td>
              <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{w.notes ?? ""}</td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No weighings match these filters.
              </td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No weighings found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
