"use client";

import Link from "next/link";
import { ListCommandToolbar, ListSearchPanel, ListSurface, SortButton, useListControls, useListSelection, type ColumnDef, type ListDefinition } from "@/components/list-controls";

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
  { key: "saleNo", label: "Broker invoice no.", accessor: (r) => r.saleNo, sortable: true, filter: "text", lov: false },
  { key: "broker", label: "Broker", accessor: (r) => r.broker, sortable: true, filter: "select" },
  { key: "dispatchDate", label: "Invoice date", accessor: (r) => r.dispatchDate ?? null, sortable: true, lov: false, searchInput: "date" },
  { key: "saleDate", label: "Sale date", accessor: (r) => r.saleDate ?? null, sortable: true, lov: false, searchInput: "date" },
  { key: "lotsCount", label: "Lots", accessor: (r) => r.lotsCount, sortable: true, lov: false, searchInput: "number" },
  { key: "statusChips", label: "Lot statuses" },
  { key: "soldLots", label: "Sold", accessor: (r) => r.soldLots, sortable: true, lov: false, searchInput: "number" },
  { key: "reprintLots", label: "Re-print", accessor: (r) => r.reprintLots, sortable: true, lov: false, searchInput: "number" },
  { key: "statusLabel", label: "Broker invoice status", accessor: (r) => r.statusLabel, sortable: true, filter: "select" },
];

const RIGHT_ALIGNED = new Set(["lotsCount", "soldLots", "reprintLots"]);

// This is a read-only related list: selecting exactly one broker invoice gives
// row-level context without introducing bulk editing controls.
const LIST: ListDefinition<DispatchInSaleRow> = {
  columns: COLUMNS,
  selectionMode: "single",
};

export function DispatchesInSaleTable({ rows }: { rows: DispatchInSaleRow[] }) {
  const controls = useListControls(rows, LIST.columns);
  const selection = useListSelection(rows, { mode: LIST.selectionMode ?? "single", getId: (row) => row.id });
  const visibleRows = controls.rows;

  return (
    <ListSurface>
      <ListCommandToolbar mode={LIST.selectionMode ?? "single"} count={selection.selectedCount} />
      <ListSearchPanel columns={LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
            {LIST.columns.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${RIGHT_ALIGNED.has(col.key) ? "text-right" : ""}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((dispatch) => (
            <tr
              key={dispatch.id}
              {...selection.rowProps(dispatch.id)}
              className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(dispatch.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
            >
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
                No broker invoices match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </ListSurface>
  );
}
