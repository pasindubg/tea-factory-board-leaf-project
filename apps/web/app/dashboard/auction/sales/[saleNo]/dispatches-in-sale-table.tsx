"use client";

import Link from "next/link";
import { useListControls, SortButton, FilterCell, type ColumnDef } from "@/components/list-controls";

export type DispatchInSaleRow = {
  id: string;
  saleNo: string;
  broker: string;
  dispatchDate: string | null;
  saleDate: string | null;
  lotsCount: number;
  statusChips: { label: string; style: string; count: number }[];
  soldLots: number;
  reprintLots: number;
  statusLabel: string;
  statusStyle: string;
};

const COLUMNS: ColumnDef<DispatchInSaleRow>[] = [
  { key: "saleNo", label: "Dispatch no.", accessor: (r) => r.saleNo, sortable: true, filter: "text" },
  { key: "broker", label: "Broker", accessor: (r) => r.broker, sortable: true, filter: "select" },
  { key: "dispatchDate", label: "Dispatched", accessor: (r) => r.dispatchDate ?? null, sortable: true },
  { key: "saleDate", label: "Sale date", accessor: (r) => r.saleDate ?? null, sortable: true },
  { key: "lotsCount", label: "Lots", accessor: (r) => r.lotsCount, sortable: true },
  { key: "statusChips", label: "Lot statuses" },
  { key: "soldLots", label: "Sold", accessor: (r) => r.soldLots, sortable: true },
  { key: "reprintLots", label: "Re-print", accessor: (r) => r.reprintLots, sortable: true },
  { key: "statusLabel", label: "Dispatch status", accessor: (r) => r.statusLabel, sortable: true, filter: "select" },
];

const RIGHT_ALIGNED = new Set(["lotsCount", "soldLots", "reprintLots"]);

export function DispatchesInSaleTable({ rows }: { rows: DispatchInSaleRow[] }) {
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
          {visibleRows.map((dispatch) => (
            <tr key={dispatch.id} className="border-b border-stone-100 last:border-0 dark:border-stone-800">
              <td className="px-4 py-2 font-medium">
                <Link href={`/dashboard/auction/${dispatch.id}`} className="text-green-700 hover:underline dark:text-green-400">
                  {dispatch.saleNo}
                </Link>
              </td>
              <td className="px-4 py-2">{dispatch.broker}</td>
              <td className="px-4 py-2 text-stone-600 dark:text-stone-400">{dispatch.dispatchDate ?? "—"}</td>
              <td className="px-4 py-2 text-stone-600 dark:text-stone-400">{dispatch.saleDate ?? "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{dispatch.lotsCount}</td>
              <td className="px-4 py-2">
                <div className="flex flex-wrap gap-1.5">
                  {dispatch.statusChips.map((item) => (
                    <span key={item.label} className={`rounded-full px-2 py-0.5 text-xs ${item.style}`}>
                      {item.label}: {item.count}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{dispatch.soldLots}</td>
              <td className="px-4 py-2 text-right tabular-nums">{dispatch.reprintLots}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${dispatch.statusStyle}`}>{dispatch.statusLabel}</span>
              </td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No dispatches match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
