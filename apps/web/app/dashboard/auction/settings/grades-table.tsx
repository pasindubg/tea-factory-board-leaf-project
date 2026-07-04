"use client";

import { useListControls, SortButton, FilterCell, type ColumnDef } from "@/components/list-controls";

export type GradeTableRow = { id: string; code: string; name: string; active: boolean; sortOrder: number };

const COLUMNS: ColumnDef<GradeTableRow>[] = [
  { key: "code", label: "Code", accessor: (r) => r.code, sortable: true, filter: "text" },
  { key: "name", label: "Name", accessor: (r) => r.name, sortable: true, filter: "text" },
  { key: "sortOrder", label: "Sort", accessor: (r) => r.sortOrder, sortable: true },
  { key: "active", label: "State", accessor: (r) => (r.active ? "Active" : "Inactive"), sortable: true, filter: "select", filterOptions: [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }] },
];

export function GradesTable({ rows }: { rows: GradeTableRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${col.key === "sortOrder" ? "text-right" : ""}`}>
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
          {visibleRows.map((grade) => (
            <tr key={grade.id} className="border-b border-stone-100 last:border-0 dark:border-stone-800">
              <td className="px-4 py-3 font-medium">{grade.code}</td>
              <td className="px-4 py-3">{grade.name}</td>
              <td className="px-4 py-3 text-right tabular-nums">{grade.sortOrder}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs ${grade.active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
                  {grade.active ? "Active" : "Inactive"}
                </span>
              </td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No grades match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No grades yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
