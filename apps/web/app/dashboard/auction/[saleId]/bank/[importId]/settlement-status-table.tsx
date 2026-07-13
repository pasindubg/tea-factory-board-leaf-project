"use client";

import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";

const LKR = (n: number) => "Rs " + n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type SettlementStatus = "settled" | "cash-only" | "under-paid" | "over-paid" | "awaiting" | "unpaid";
const STATUS_STYLE: Record<SettlementStatus, string> = {
  settled: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300",
  "cash-only": "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300",
  "under-paid": "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300",
  "over-paid": "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300",
  awaiting: "bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300",
  unpaid: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300",
};
const STATUS_OPTIONS: SettlementStatus[] = ["settled", "cash-only", "under-paid", "over-paid", "awaiting", "unpaid"];

export type SettlementStatusRow = {
  id: string;
  contractNo: string;
  expected: number;
  cashOnly: number;
  received: number;
  status: SettlementStatus;
  note: string;
};

const COLUMNS: ColumnDef<SettlementStatusRow>[] = [
  { key: "contractNo", label: "Contract", accessor: (r) => r.contractNo, sortable: true, filter: "text" },
  { key: "expected", label: "Expected", accessor: (r) => r.expected, sortable: true },
  { key: "cashOnly", label: "Cash-only", accessor: (r) => r.cashOnly, sortable: true },
  { key: "received", label: "Received", accessor: (r) => r.received, sortable: true },
  { key: "status", label: "Status", accessor: (r) => r.status, sortable: true, filter: "select", filterOptions: STATUS_OPTIONS.map((s) => ({ value: s, label: s })) },
  { key: "note", label: "Note", accessor: (r) => r.note, sortable: true, filter: "text" },
];

const RIGHT_ALIGNED = new Set(["expected", "cashOnly", "received"]);

export function SettlementStatusTable({ rows }: { rows: SettlementStatusRow[] }) {
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
          {visibleRows.map((c) => (
            <tr key={c.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
              <td className="px-3 py-2 font-medium">{c.contractNo}</td>
              <td className="px-3 py-2 text-right tabular-nums">{LKR(c.expected)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-stone-500 dark:text-stone-400">{LKR(c.cashOnly)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{c.received > 0 ? LKR(c.received) : "—"}</td>
              <td className="px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[c.status]}`}>{c.status}</span>
              </td>
              <td className="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">{c.note}</td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No rows match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No settlements.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
