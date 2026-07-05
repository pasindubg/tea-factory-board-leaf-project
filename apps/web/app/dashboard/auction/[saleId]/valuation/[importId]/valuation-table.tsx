"use client";

import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";

export type ValuationTableRow = {
  invoiceNo: string;
  lotNo: string;
  grade: string;
  netWt: number;
  priceMin: number;
  priceMax: number;
  projectedProceeds: number;
  tastingNote: string;
  matched: boolean;
};

const COLUMNS: ColumnDef<ValuationTableRow>[] = [
  { key: "invoiceNo", label: "Invoice", accessor: (r) => r.invoiceNo, sortable: true, filter: "text" },
  { key: "lotNo", label: "Lot", accessor: (r) => r.lotNo, sortable: true, filter: "text" },
  { key: "grade", label: "Grade", accessor: (r) => r.grade, sortable: true, filter: "select" },
  { key: "netWt", label: "Net kg", accessor: (r) => r.netWt, sortable: true },
  { key: "priceMin", label: "Valuation /kg", accessor: (r) => r.priceMin, sortable: true },
  { key: "projectedProceeds", label: "Projected", accessor: (r) => r.projectedProceeds, sortable: true },
  { key: "tastingNote", label: "Tasting note", accessor: (r) => r.tastingNote, sortable: true, filter: "text" },
  { key: "matched", label: "Match", accessor: (r) => (r.matched ? "lot" : "no lot"), sortable: true, filter: "select", filterOptions: [{ value: "lot", label: "lot" }, { value: "no lot", label: "no lot" }] },
];

const RIGHT_ALIGNED = new Set(["netWt", "priceMin", "projectedProceeds"]);

export function ValuationTable({ rows }: { rows: ValuationTableRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-3 py-3 ${RIGHT_ALIGNED.has(col.key) ? "text-right" : ""}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((l) => (
            <tr key={l.invoiceNo} className="border-b border-stone-100 dark:border-stone-800 last:border-0 align-top">
              <td className="px-3 py-2 font-medium">{l.invoiceNo}</td>
              <td className="px-3 py-2">{l.lotNo}</td>
              <td className="px-3 py-2">{l.grade}</td>
              <td className="px-3 py-2 text-right">{l.netWt.toFixed(2)}</td>
              <td className="px-3 py-2 text-right">
                {l.priceMin === l.priceMax ? l.priceMin.toFixed(2) : `${l.priceMin}–${l.priceMax}`}
              </td>
              <td className="px-3 py-2 text-right">{l.projectedProceeds.toLocaleString()}</td>
              <td className="px-3 py-2 max-w-xs text-xs text-stone-500 dark:text-stone-400">{l.tastingNote}</td>
              <td className="px-3 py-2">
                {l.matched ? (
                  <span className="rounded-full bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-xs text-blue-800 dark:text-blue-400">lot</span>
                ) : (
                  <span className="rounded-full bg-amber-100 dark:bg-amber-900 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-400">no lot</span>
                )}
              </td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-stone-400 dark:text-stone-500">
                No rows match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
