"use client";

import Link from "next/link";
import { ListCommandToolbar, ListSearchPanel, ListSidePanel, SortButton, useListControls, type ColumnDef } from "@/components/list-controls";
import { saleNoKey, saleNoMatches } from "../../sale-number";

export type SaleSideListRow = {
  saleNo: string;
  dispatchNos: string[];
  brokers: string[];
  saleDate: string | null;
  statuses: string[];
};

const COLUMNS: ColumnDef<SaleSideListRow>[] = [
  { key: "saleNo", label: "Sale", accessor: (row) => row.saleNo, sortable: true, filter: "text" },
  { key: "dispatchNos", label: "Broker invoices", accessor: (row) => row.dispatchNos.join(", ") || null, sortable: true, filter: "text" },
  { key: "brokers", label: "Brokers", accessor: (row) => row.brokers.join(", ") || null, sortable: true, filter: "text" },
  { key: "saleDate", label: "Sale date", accessor: (row) => row.saleDate ?? null, sortable: true, searchInput: "date" },
  { key: "statuses", label: "Status", accessor: (row) => row.statuses.join(", ") || null, sortable: true, filter: "text" },
];

export function SalesSideList({ rows, currentSaleNo }: { rows: SaleSideListRow[]; currentSaleNo: string }) {
  const controls = useListControls(rows, COLUMNS);
  return (
    <ListSidePanel
      title="Sales"
      actions={<SortButton col={COLUMNS[0]} controls={controls} />}
      className="xl:sticky xl:top-0 xl:h-[calc(100dvh-8rem)] xl:min-h-[34rem] xl:flex-col"
    >
      <ListCommandToolbar mode="single" showSelectionSummary={false} />
      <ListSearchPanel columns={COLUMNS} controls={controls} label="Search" variant="popover" />
      <div className="max-h-[28rem] overflow-y-auto xl:max-h-none xl:min-h-0 xl:flex-1">
        {controls.rows.map((sale) => {
          const active = saleNoMatches(sale.saleNo, currentSaleNo);
          const href = `/dashboard/auction/sales/${encodeURIComponent(saleNoKey(sale.saleNo) || sale.saleNo)}`;
          return (
            <Link
              key={sale.saleNo}
              href={href}
              className={`block border-b border-stone-100 px-4 py-3 text-sm last:border-0 dark:border-stone-800 ${
                active
                  ? "bg-green-50 text-green-950 dark:bg-green-950 dark:text-green-100"
                  : "hover:bg-stone-50 dark:hover:bg-stone-800/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold tabular-nums text-green-700 dark:text-green-400">{sale.saleNo}</span>
                {active && <span className="text-stone-400">‹</span>}
              </div>
              <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{sale.brokers.join(", ") || "—"}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="tabular-nums text-stone-500 dark:text-stone-400">{sale.dispatchNos.length} broker invoice{sale.dispatchNos.length === 1 ? "" : "s"}</span>
                <span className="text-stone-500 dark:text-stone-400">{sale.saleDate ?? "—"}</span>
              </div>
            </Link>
          );
        })}
        {controls.rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500">No sales match.</p>
        )}
      </div>
    </ListSidePanel>
  );
}
