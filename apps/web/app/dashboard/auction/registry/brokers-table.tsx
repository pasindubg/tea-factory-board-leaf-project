"use client";

import { useListControls, SortButton, FilterCell, type ColumnDef } from "@/components/list-controls";

export type BrokerRow = { id: string; name: string; vat_no: string | null };

const COLUMNS: ColumnDef<BrokerRow>[] = [
  { key: "name", label: "Name", accessor: (r) => r.name, sortable: true, filter: "text" },
  { key: "vat_no", label: "VAT no.", accessor: (r) => r.vat_no ?? null, sortable: true, filter: "text" },
];

export function BrokersTable({ rows }: { rows: BrokerRow[] }) {
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
          {visibleRows.map((b) => (
            <tr key={b.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
              <td className="px-4 py-3 font-medium">{b.name}</td>
              <td className="px-4 py-3">{b.vat_no ?? "—"}</td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No brokers match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No brokers yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
