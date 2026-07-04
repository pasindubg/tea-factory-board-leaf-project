"use client";

import { useListControls, SortButton, FilterCell, type ColumnDef } from "@/components/list-controls";

export type RateRow = {
  id: string;
  broker: string;
  effectiveFrom: string;
  brokeragePct: number;
  insurancePerKg: number;
  chargesVatPct: number;
};

const COLUMNS: ColumnDef<RateRow>[] = [
  { key: "broker", label: "Broker", accessor: (r) => r.broker, sortable: true, filter: "select" },
  { key: "effectiveFrom", label: "Effective", accessor: (r) => r.effectiveFrom, sortable: true },
  { key: "brokeragePct", label: "Brokerage", accessor: (r) => r.brokeragePct, sortable: true },
  { key: "insurancePerKg", label: "Ins./kg", accessor: (r) => r.insurancePerKg, sortable: true },
  { key: "chargesVatPct", label: "Charges VAT", accessor: (r) => r.chargesVatPct, sortable: true },
];

export function RatesTable({ rows }: { rows: RateRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-3 py-3 ${col.key === "broker" || col.key === "effectiveFrom" ? "" : "text-right"}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
          {controls.hasFilters && (
            <tr className="border-b border-stone-100 bg-stone-50/60 dark:border-stone-800 dark:bg-stone-900/40">
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-3 py-1.5 font-normal">
                  <FilterCell col={col} controls={controls} />
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {visibleRows.map((r) => (
            <tr key={r.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
              <td className="px-3 py-3 font-medium">{r.broker}</td>
              <td className="px-3 py-3">{r.effectiveFrom}</td>
              <td className="px-3 py-3 text-right tabular-nums">{r.brokeragePct.toFixed(3)}%</td>
              <td className="px-3 py-3 text-right tabular-nums">{r.insurancePerKg.toFixed(4)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{r.chargesVatPct.toFixed(0)}%</td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No rate cards match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No rate cards yet — add one so settlements can be computed.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
