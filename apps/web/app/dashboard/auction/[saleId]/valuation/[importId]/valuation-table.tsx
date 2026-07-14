"use client";

import { ListCommandToolbar, ListSearchPanel, ListSurface, SortButton, useListControls, useListSelection, type ColumnDef, type ListDefinition } from "@/components/list-controls";

export type ValuationTableRow = {
  id: string;
  invoiceNo: string;
  lotNo: string;
  grade: string;
  netWt: number;
  priceMin: number;
  priceMax: number;
  projectedProceeds: number;
  expectedProceeds: number;
  proceedsVariance: number;
  proceedsTallies: boolean;
  tastingNote: string;
  matched: boolean;
  currentSaleNo: string;
  outcome: string;
};

const COLUMNS: ColumnDef<ValuationTableRow>[] = [
  { key: "invoiceNo", label: "Invoice", accessor: (r) => r.invoiceNo, sortable: true, filter: "text" },
  { key: "currentSaleNo", label: "Current sale", accessor: (r) => r.currentSaleNo || null, sortable: true, filter: "text" },
  { key: "outcome", label: "On confirm", accessor: (r) => r.outcome, sortable: true, filter: "select" },
  { key: "lotNo", label: "Lot", accessor: (r) => r.lotNo, sortable: true, filter: "text" },
  { key: "grade", label: "Grade", accessor: (r) => r.grade, sortable: true, filter: "select" },
  { key: "netWt", label: "Net kg", accessor: (r) => r.netWt, sortable: true },
  { key: "priceMin", label: "Valuation /kg", accessor: (r) => r.priceMin, sortable: true },
  { key: "expectedProceeds", label: "Low × net kg", accessor: (r) => r.expectedProceeds, sortable: true, searchInput: "number" },
  { key: "projectedProceeds", label: "Reported proceeds", accessor: (r) => r.projectedProceeds, sortable: true, searchInput: "number" },
  { key: "proceedsVariance", label: "Difference", accessor: (r) => r.proceedsVariance, sortable: true, searchInput: "number" },
  { key: "proceedsTallies", label: "Tally", accessor: (r) => r.proceedsTallies ? "tallies" : "does not tally", sortable: true, filter: "select", filterOptions: [{ value: "tallies", label: "tallies" }, { value: "does not tally", label: "does not tally" }] },
  { key: "tastingNote", label: "Tasting note", accessor: (r) => r.tastingNote, sortable: true, filter: "text" },
  { key: "matched", label: "Match", accessor: (r) => (r.matched ? "lot" : "no lot"), sortable: true, filter: "select", filterOptions: [{ value: "lot", label: "lot" }, { value: "no lot", label: "no lot" }] },
];

const LIST: ListDefinition<ValuationTableRow> = { columns: COLUMNS, selectionMode: "single", add: false, edit: false, delete: false };

const RIGHT_ALIGNED = new Set(["netWt", "priceMin", "expectedProceeds", "projectedProceeds", "proceedsVariance"]);

export function ValuationTable({ rows }: { rows: ValuationTableRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const selection = useListSelection(rows, { mode: LIST.selectionMode ?? "single", getId: (row) => row.id });
  const visibleRows = controls.rows;

  return (
    <ListSurface>
      <ListCommandToolbar mode={LIST.selectionMode ?? "single"} count={selection.selectedCount} />
      <ListSearchPanel columns={LIST.columns} controls={controls} label="Find valuation rows" />
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {LIST.columns.map((col) => (
              <th key={col.key} className={`px-3 py-3 ${RIGHT_ALIGNED.has(col.key) ? "text-right" : ""}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((l) => (
            <tr key={l.id} {...selection.rowProps(l.id)} className={`cursor-pointer border-b border-stone-100 dark:border-stone-800 last:border-0 align-top ${selection.isSelected(l.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}>
              <td className="px-3 py-2 font-medium">{l.invoiceNo}</td>
              <td className="px-3 py-2">{l.currentSaleNo || "—"}</td>
              <td className="px-3 py-2 text-xs">{l.outcome}</td>
              <td className="px-3 py-2">{l.lotNo}</td>
              <td className="px-3 py-2">{l.grade}</td>
              <td className="px-3 py-2 text-right">{l.netWt.toFixed(2)}</td>
              <td className="px-3 py-2 text-right">
                {l.priceMin === l.priceMax ? l.priceMin.toFixed(2) : `${l.priceMin}–${l.priceMax}`}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{l.expectedProceeds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="px-3 py-2 text-right tabular-nums">{l.projectedProceeds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${l.proceedsTallies ? "text-green-800 dark:text-green-300" : "text-amber-800 dark:text-amber-300"}`}>{l.proceedsVariance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${l.proceedsTallies ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300"}`}>{l.proceedsTallies ? "tallies" : "check"}</span></td>
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
              <td colSpan={LIST.columns.length} className="px-3 py-8 text-center text-stone-400 dark:text-stone-500">
                No rows match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table></div>
    </ListSurface>
  );
}
