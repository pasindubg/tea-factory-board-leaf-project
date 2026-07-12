"use client";

import Link from "next/link";
import { ListSearchPanel, SortButton, useListControls, type ColumnDef } from "@/components/list-controls";

export type ReprintOverviewRow = {
  id: string;
  dispatchId: string;
  dispatchNo: string | null;
  saleNo: string | null;
  broker: string;
  dispatchDate: string | null;
  saleDate: string | null;
  invoiceNo: string;
  lotNo: string | null;
  grade: string | null;
  bags: number | null;
  kgPerBag: number | null;
  totalSampleKg: number;
  remainingNetKg: number;
  actualSoldKg: number | null;
  reprintSales: string;
  soldSale: string | null;
  history: string;
  source: string | null;
  stateLabel: string;
  stateStyle: string;
  reprintCount: number;
};

const COLUMNS: ColumnDef<ReprintOverviewRow>[] = [
  { key: "dispatchNo", label: "Dispatch", accessor: (r) => r.dispatchNo ?? null, sortable: true, filter: "text" },
  { key: "saleNo", label: "Sale", accessor: (r) => r.saleNo ?? null, sortable: true, filter: "text" },
  { key: "broker", label: "Broker", accessor: (r) => r.broker, sortable: true, filter: "select" },
  { key: "invoiceNo", label: "Invoice(s)", accessor: (r) => r.invoiceNo, sortable: true, filter: "text" },
  { key: "lotNo", label: "Lot no.", accessor: (r) => r.lotNo ?? null, sortable: true, filter: "text" },
  { key: "grade", label: "Grade", accessor: (r) => r.grade ?? null, sortable: true, filter: "select" },
  { key: "bags", label: "Bags", accessor: (r) => r.bags ?? null, sortable: true },
  { key: "kgPerBag", label: "kg/bag", accessor: (r) => r.kgPerBag ?? null, sortable: true },
  { key: "reprintSales", label: "Re-printed sales", accessor: (r) => r.reprintSales, sortable: true, filter: "text" },
  { key: "soldSale", label: "Sold sale", accessor: (r) => r.soldSale ?? null, sortable: true, filter: "text" },
  { key: "totalSampleKg", label: "Total sample kg", accessor: (r) => r.totalSampleKg, sortable: true },
  { key: "remainingNetKg", label: "Remaining kg", accessor: (r) => r.remainingNetKg, sortable: true },
  { key: "actualSoldKg", label: "Actual sold kg", accessor: (r) => r.actualSoldKg ?? null, sortable: true },
  { key: "history", label: "History", accessor: (r) => r.history, sortable: false, filter: "text" },
  { key: "dispatchDate", label: "Dispatched", accessor: (r) => r.dispatchDate ?? null, sortable: true, searchInput: "date" },
  { key: "saleDate", label: "Sale date", accessor: (r) => r.saleDate ?? null, sortable: true, searchInput: "date" },
  { key: "source", label: "Source", accessor: (r) => r.source ?? null, sortable: true, filter: "select" },
  { key: "stateLabel", label: "State", accessor: (r) => r.stateLabel, sortable: true, filter: "select" },
  { key: "reprintCount", label: "Re-print count", accessor: (r) => r.reprintCount, sortable: true },
];

const RIGHT_ALIGNED = new Set(["bags", "kgPerBag", "totalSampleKg", "remainingNetKg", "actualSoldKg", "reprintCount"]);

export function ReprintOverviewTable({ rows }: { rows: ReprintOverviewRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${RIGHT_ALIGNED.has(col.key) ? "text-right" : ""}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.id} className="border-b border-stone-100 last:border-0 dark:border-stone-800">
              <td className="px-4 py-2">
                <Link href={`/dashboard/auction/${row.dispatchId}`} className="font-medium text-green-700 hover:underline dark:text-green-400">
                  {row.dispatchNo ?? "—"}
                </Link>
              </td>
              <td className="px-4 py-2">{row.saleNo ?? "—"}</td>
              <td className="px-4 py-2">{row.broker}</td>
              <td className="px-4 py-2 font-medium">{row.invoiceNo}</td>
              <td className="px-4 py-2">{row.lotNo ?? "—"}</td>
              <td className="px-4 py-2">{row.grade ?? "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{row.bags ?? "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{row.kgPerBag != null ? row.kgPerBag.toFixed(2) : "—"}</td>
              <td className="px-4 py-2">{row.reprintSales}</td>
              <td className="px-4 py-2">{row.soldSale ?? "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{row.totalSampleKg.toFixed(2)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{row.remainingNetKg.toFixed(2)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{row.actualSoldKg != null ? row.actualSoldKg.toFixed(2) : "—"}</td>
              <td className="min-w-64 px-4 py-2 text-xs text-stone-500 dark:text-stone-400">{row.history}</td>
              <td className="px-4 py-2 tabular-nums">{row.dispatchDate ?? "—"}</td>
              <td className="px-4 py-2 tabular-nums">{row.saleDate ?? "—"}</td>
              <td className="px-4 py-2">{row.source ?? "—"}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${row.stateStyle}`}>{row.stateLabel}</span>
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{row.reprintCount}</td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={19} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No re-print lots match these filters.
              </td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={19} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No invoices have been marked for re-print yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
