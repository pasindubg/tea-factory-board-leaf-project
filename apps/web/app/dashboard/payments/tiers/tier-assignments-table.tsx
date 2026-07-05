"use client";

import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";

export type TierAssignmentRow = {
  id: string;
  supplierName: string;
  area: string | null;
  tierName: string | null;
  effectiveFrom: string | null;
  source: string | null;
};

const COLUMNS: ColumnDef<TierAssignmentRow>[] = [
  { key: "supplierName", label: "Supplier", accessor: (r) => r.supplierName, sortable: true, filter: "text" },
  { key: "area", label: "Area", accessor: (r) => r.area ?? null, sortable: true, filter: "select" },
  { key: "tierName", label: "Current tier", accessor: (r) => r.tierName ?? "Standard (none)", sortable: true, filter: "select" },
  { key: "effectiveFrom", label: "Since", accessor: (r) => r.effectiveFrom ?? null, sortable: true },
  { key: "source", label: "Source", accessor: (r) => r.source ?? null, sortable: true, filter: "select" },
];

export function TierAssignmentsTable({ rows }: { rows: TierAssignmentRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className="px-4 py-3">
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((sp) => (
            <tr key={sp.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
              <td className="px-4 py-3 font-medium">{sp.supplierName}</td>
              <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{sp.area ?? "—"}</td>
              <td className="px-4 py-3">{sp.tierName ?? <span className="text-stone-400 dark:text-stone-500">Standard (none)</span>}</td>
              <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{sp.effectiveFrom ?? "—"}</td>
              <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{sp.source ?? "—"}</td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No suppliers match these filters.</td></tr>
          )}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No active suppliers.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
