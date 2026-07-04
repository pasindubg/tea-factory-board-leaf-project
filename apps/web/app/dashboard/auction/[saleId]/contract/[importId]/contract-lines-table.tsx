"use client";

import type { ValClass } from "@tea/api";
import { useListControls, SortButton, FilterCell, type ColumnDef } from "@/components/list-controls";

const CLASS_STYLE: Record<ValClass, string> = {
  above: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400",
  within: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400",
  below: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-400",
  "no-valuation": "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400",
};

const CLASS_OPTIONS: ValClass[] = ["above", "within", "below", "no-valuation"];

export type ContractLineRow = {
  invoiceNo: string;
  buyerName: string;
  pricePerKg: number;
  priceMin: number | null;
  priceMax: number | null;
  classification: ValClass;
  proceeds: number;
  variance: number | null;
  vatAmount: number;
  onGuarantee: boolean;
};

const COLUMNS: ColumnDef<ContractLineRow>[] = [
  { key: "invoiceNo", label: "Invoice", accessor: (r) => r.invoiceNo, sortable: true, filter: "text" },
  { key: "buyerName", label: "Buyer", accessor: (r) => r.buyerName, sortable: true, filter: "select" },
  { key: "pricePerKg", label: "Price/kg", accessor: (r) => r.pricePerKg, sortable: true },
  { key: "priceMin", label: "Valuation /kg", accessor: (r) => r.priceMin ?? null, sortable: true },
  { key: "classification", label: "vs range", accessor: (r) => r.classification, sortable: true, filter: "select", filterOptions: CLASS_OPTIONS.map((c) => ({ value: c, label: c })) },
  { key: "proceeds", label: "Proceeds", accessor: (r) => r.proceeds, sortable: true },
  { key: "variance", label: "Δ vs projected", accessor: (r) => r.variance ?? null, sortable: true },
  { key: "vatAmount", label: "VAT", accessor: (r) => r.vatAmount, sortable: true },
];

const RIGHT_ALIGNED = new Set(["pricePerKg", "proceeds", "variance"]);

export function ContractLinesTable({ rows }: { rows: ContractLineRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-3 py-3 ${RIGHT_ALIGNED.has(col.key) ? "text-right" : ""}`}>
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
          {visibleRows.map((l) => (
            <tr key={l.invoiceNo} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
              <td className="px-3 py-2 font-medium">{l.invoiceNo}</td>
              <td className="px-3 py-2 text-xs">{l.buyerName}</td>
              <td className="px-3 py-2 text-right">{l.pricePerKg.toLocaleString()}</td>
              <td className="px-3 py-2">
                {l.priceMin != null
                  ? l.priceMin === l.priceMax
                    ? l.priceMin.toFixed(0)
                    : `${l.priceMin}–${l.priceMax}`
                  : "—"}
              </td>
              <td className="px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${CLASS_STYLE[l.classification]}`}>{l.classification}</span>
              </td>
              <td className="px-3 py-2 text-right">{l.proceeds.toLocaleString()}</td>
              <td className="px-3 py-2 text-right">
                {l.variance == null ? "—" : `${l.variance > 0 ? "+" : ""}${l.variance.toLocaleString()}`}
              </td>
              <td className="px-3 py-2 text-xs">
                {l.vatAmount.toLocaleString()}
                {l.onGuarantee && <span className="ml-1 rounded bg-amber-100 dark:bg-amber-900 px-1 text-amber-800 dark:text-amber-400">guar.</span>}
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
