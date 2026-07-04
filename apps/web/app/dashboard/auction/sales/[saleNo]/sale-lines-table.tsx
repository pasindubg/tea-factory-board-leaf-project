"use client";

import Link from "next/link";
import { money } from "../../format";
import { useListControls, SortButton, FilterCell, type ColumnDef } from "@/components/list-controls";

export type SaleLineRow = {
  id: string;
  dispatchId: string | null;
  dispatchSaleNo: string | null;
  lotNo: string | null;
  invoiceNo: string | null;
  grade: string | null;
  buyerName: string | null;
  buyerVatNo: string | null;
  bags: number | null;
  kgPerBag: number | null;
  netWt: number;
  pricePerKg: number;
  proceeds: number;
  vatAmount: number;
  onGuarantee: boolean;
  reprint: boolean;
};

const COLUMNS: ColumnDef<SaleLineRow>[] = [
  { key: "dispatchSaleNo", label: "Dispatch no.", accessor: (r) => r.dispatchSaleNo ?? null, sortable: true, filter: "text" },
  { key: "lotNo", label: "Lot no.", accessor: (r) => r.lotNo ?? null, sortable: true, filter: "text" },
  { key: "invoiceNo", label: "Invoice", accessor: (r) => r.invoiceNo ?? null, sortable: true, filter: "text" },
  { key: "grade", label: "Grade", accessor: (r) => r.grade ?? null, sortable: true, filter: "select" },
  { key: "buyerName", label: "Buyer", accessor: (r) => r.buyerName ?? null, sortable: true, filter: "select" },
  { key: "bags", label: "Bags", accessor: (r) => r.bags ?? null, sortable: true },
  { key: "kgPerBag", label: "kg/bag", accessor: (r) => r.kgPerBag ?? null, sortable: true },
  { key: "netWt", label: "Net kg", accessor: (r) => r.netWt, sortable: true },
  { key: "pricePerKg", label: "Price/kg", accessor: (r) => r.pricePerKg, sortable: true },
  { key: "proceeds", label: "Proceeds", accessor: (r) => r.proceeds, sortable: true },
  { key: "vatAmount", label: "VAT", accessor: (r) => r.vatAmount, sortable: true },
  { key: "onGuarantee", label: "Guarantee", accessor: (r) => (r.onGuarantee ? "Guarantee" : "Cash"), sortable: true, filter: "select", filterOptions: [{ value: "Guarantee", label: "Guarantee" }, { value: "Cash", label: "Cash" }] },
  { key: "reprint", label: "Re-print", accessor: (r) => (r.reprint ? "Yes" : "No"), sortable: true, filter: "select", filterOptions: [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }] },
];

const RIGHT_ALIGNED = new Set(["bags", "kgPerBag", "netWt", "pricePerKg", "proceeds", "vatAmount"]);

export function SaleLinesTable({ rows }: { rows: SaleLineRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${RIGHT_ALIGNED.has(col.key) ? "text-right" : ""}`}>
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
          {visibleRows.map((line) => (
            <tr key={line.id} className="border-b border-stone-100 last:border-0 dark:border-stone-800">
              <td className="px-4 py-2">
                {line.dispatchId ? (
                  <Link href={`/dashboard/auction/${line.dispatchId}`} className="text-green-700 hover:underline dark:text-green-400">
                    {line.dispatchSaleNo}
                  </Link>
                ) : "—"}
              </td>
              <td className="px-4 py-2">{line.lotNo ?? "—"}</td>
              <td className="px-4 py-2 font-medium">{line.invoiceNo ?? "—"}</td>
              <td className="px-4 py-2">{line.grade ?? "—"}</td>
              <td className="px-4 py-2">
                {line.buyerName ?? "—"}
                {line.buyerVatNo && <span className="ml-1 text-xs text-stone-400 dark:text-stone-500">{line.buyerVatNo}</span>}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{line.bags ?? "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{line.kgPerBag != null ? line.kgPerBag.toFixed(2) : "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{line.netWt.toFixed(2)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{line.pricePerKg.toFixed(2)}</td>
              <td className="px-4 py-2 text-right tabular-nums font-medium">{money(line.proceeds)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(line.vatAmount)}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${line.onGuarantee ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-400" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
                  {line.onGuarantee ? "Guarantee" : "Cash"}
                </span>
              </td>
              <td className="px-4 py-2">{line.reprint ? "Yes" : "No"}</td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={13} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No sold lots match these filters.
              </td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={13} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No sold lots have been confirmed for this sale yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
