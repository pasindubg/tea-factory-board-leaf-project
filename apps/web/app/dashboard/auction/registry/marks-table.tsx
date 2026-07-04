"use client";

import { useListControls, SortButton, FilterCell, type ColumnDef } from "@/components/list-controls";

export type MarkRow = { id: string; code: string; name: string };

const COLUMNS: ColumnDef<MarkRow>[] = [
  { key: "code", label: "Code", accessor: (r) => r.code, sortable: true, filter: "text" },
  { key: "name", label: "Name", accessor: (r) => r.name, sortable: true, filter: "text" },
];

export function MarksTable({ rows }: { rows: MarkRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className="px-4 py-3">
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
          {controls.hasFilters && (
            <tr className="border-b border-stone-100 bg-stone-50/60 dark:border-stone-800 dark:bg-stone-900/40">
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-1.5 font-normal">
                  <FilterCell col={col} controls={controls} />
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {visibleRows.map((m) => (
            <tr key={m.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
              <td className="px-4 py-3 font-medium">{m.code}</td>
              <td className="px-4 py-3">{m.name}</td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No marks match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No marks yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
