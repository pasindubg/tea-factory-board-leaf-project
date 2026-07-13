"use client";

import Link from "next/link";
import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";

export type BySaleRow = {
  id: string;
  saleNo: string;
  targetSaleNo: string | null;
  broker: string;
  status: string;
  statusChip: string;
  lotsCount: number;
  netKg: number;
  proceeds: number | null;
  settlement: number | null;
};

const LKR = (n: number) => "Rs " + n.toLocaleString("en-LK", { maximumFractionDigits: 0 });

const COLUMNS: ColumnDef<BySaleRow>[] = [
  { key: "saleNo", label: "Broker invoice", accessor: (r) => r.saleNo, sortable: true, filter: "text" },
  { key: "targetSaleNo", label: "Sale", accessor: (r) => r.targetSaleNo ?? null, sortable: true, filter: "text" },
  { key: "broker", label: "Broker", accessor: (r) => r.broker, sortable: true, filter: "select" },
  { key: "status", label: "Status", accessor: (r) => r.status, sortable: true, filter: "select" },
  { key: "lotsCount", label: "Lots", accessor: (r) => r.lotsCount, sortable: true },
  { key: "netKg", label: "Net kg", accessor: (r) => r.netKg, sortable: true },
  { key: "proceeds", label: "Proceeds", accessor: (r) => r.proceeds ?? null, sortable: true },
  { key: "settlement", label: "Settlement", accessor: (r) => r.settlement ?? null, sortable: true },
];

const RIGHT_ALIGNED = new Set(["lotsCount", "netKg", "proceeds", "settlement"]);

export function BySaleTable({ rows }: { rows: BySaleRow[] }) {
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
          {visibleRows.map((s) => (
            <tr key={s.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0 hover:bg-stone-50 dark:hover:bg-stone-800/50">
              <td className="px-3 py-2 font-medium">
                <Link href={`/dashboard/auction/${s.id}`} className="text-green-700 dark:text-green-400 hover:underline">
                  {s.saleNo}
                </Link>
              </td>
              <td className="px-3 py-2 tabular-nums text-stone-600 dark:text-stone-400">{s.targetSaleNo || "—"}</td>
              <td className="px-3 py-2">{s.broker}</td>
              <td className="px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${s.statusChip}`}>{s.status}</span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{s.lotsCount}</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.netKg.toFixed(2)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.proceeds != null ? LKR(s.proceeds) : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.settlement != null ? LKR(s.settlement) : "—"}</td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-stone-400 dark:text-stone-500">
                No sales match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
