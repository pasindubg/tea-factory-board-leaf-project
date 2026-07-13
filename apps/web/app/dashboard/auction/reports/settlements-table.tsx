"use client";

import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";

export type SettlementRow = {
  id: string;
  contractNo: string;
  dispatchNo: string;
  saleNo: string;
  broker: string;
  proceeds: number;
  deductions: number;
  netProceeds: number;
  outputVat: number;
  totalNet: number;
  credited: number;
  remaining: number;
  settled: boolean;
};

const fmt = (n: number) => n.toLocaleString("en-LK", { minimumFractionDigits: 2 });

const COLUMNS: ColumnDef<SettlementRow>[] = [
  { key: "contractNo", label: "Contract", accessor: (r) => r.contractNo, sortable: true, filter: "text" },
  { key: "dispatchNo", label: "Broker invoice", accessor: (r) => r.dispatchNo, sortable: true, filter: "text" },
  { key: "saleNo", label: "Sale", accessor: (r) => r.saleNo, sortable: true, filter: "text" },
  { key: "broker", label: "Broker", accessor: (r) => r.broker, sortable: true, filter: "select" },
  { key: "proceeds", label: "Proceeds", accessor: (r) => r.proceeds, sortable: true },
  { key: "deductions", label: "Deductions", accessor: (r) => r.deductions, sortable: true },
  { key: "netProceeds", label: "Net proceeds", accessor: (r) => r.netProceeds, sortable: true },
  { key: "outputVat", label: "Output VAT", accessor: (r) => r.outputVat, sortable: true },
  { key: "totalNet", label: "Total net", accessor: (r) => r.totalNet, sortable: true },
  { key: "credited", label: "Credited", accessor: (r) => r.credited, sortable: true },
  { key: "remaining", label: "Remaining", accessor: (r) => r.remaining, sortable: true },
  { key: "settled", label: "Settled", accessor: (r) => (r.settled ? "Settled" : "Pending"), sortable: true, filter: "select", filterOptions: [{ value: "Settled", label: "Settled" }, { value: "Pending", label: "Pending" }] },
];

const RIGHT_ALIGNED = new Set(["proceeds", "deductions", "netProceeds", "outputVat", "totalNet", "credited", "remaining"]);

export function SettlementsTable({ rows }: { rows: SettlementRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="mt-4 rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900 overflow-x-auto">
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${RIGHT_ALIGNED.has(col.key) ? "text-right" : ""}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => (
            <tr key={r.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
              <td className="px-4 py-2 font-medium">{r.contractNo}</td>
              <td className="px-4 py-2">{r.dispatchNo}</td>
              <td className="px-4 py-2">{r.saleNo}</td>
              <td className="px-4 py-2">{r.broker}</td>
              <td className="px-4 py-2 text-right">{fmt(r.proceeds)}</td>
              <td className="px-4 py-2 text-right">{fmt(r.deductions)}</td>
              <td className="px-4 py-2 text-right">{fmt(r.netProceeds)}</td>
              <td className="px-4 py-2 text-right">{fmt(r.outputVat)}</td>
              <td className="px-4 py-2 text-right">{fmt(r.totalNet)}</td>
              <td className="px-4 py-2 text-right text-green-700 dark:text-green-400">{fmt(r.credited)}</td>
              <td className={`px-4 py-2 text-right ${r.settled ? "text-stone-400 dark:text-stone-500" : "text-amber-700 dark:text-amber-400 font-medium"}`}>
                {fmt(r.remaining)}
              </td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${r.settled ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-400"}`}>
                  {r.settled ? "Settled" : "Pending"}
                </span>
              </td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={12} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No settlements match these filters.
              </td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={12} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No settlements yet — upload a sellers contract from the “Upload &amp; review documents” tab.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
