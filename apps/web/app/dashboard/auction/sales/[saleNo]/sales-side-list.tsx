"use client";

import { DetailSideList } from "@/components/detail-side-list";
import type { ColumnDef } from "@/components/list-controls";
import type { AuctionSalesSideListRow } from "@/lib/list-resources";
import { saleNoKey, saleNoMatches } from "../../sale-number";

export type SaleSideListRow = AuctionSalesSideListRow;

const COLUMNS: ColumnDef<SaleSideListRow>[] = [
  { key: "saleNo", label: "Sale", accessor: (row) => row.saleNo, sortable: true, filter: "text" },
  { key: "dispatchNos", label: "Dispatch invoices", accessor: (row) => row.dispatchNos.join(", ") || null, sortable: true, filter: "text" },
  { key: "brokers", label: "Brokers", accessor: (row) => row.brokers.join(", ") || null, sortable: true, filter: "text" },
  { key: "saleDate", label: "Sale date", accessor: (row) => row.saleDate ?? null, sortable: true, searchInput: "date" },
  { key: "statuses", label: "Status", accessor: (row) => row.statuses.join(", ") || null, sortable: true, filter: "text" },
  { key: "reprintRegister", label: "Re-print register", accessor: (row) => row.reprintRegister, boolean: true, sortable: true, filter: "select" },
];

export function SalesSideList({ rows, currentSaleNo, searchPanelId }: {
  rows: SaleSideListRow[]; currentSaleNo: string; searchPanelId: string;
}) {
  return (
    <DetailSideList
      resource={{ key: "auction.sales-side-list" }}
      initialRows={rows}
      columns={COLUMNS}
      getId={(row) => saleNoKey(row.saleNo) || row.saleNo}
      rowLabel={(row) => `Sale ${row.saleNo}`}
      searchPanelId={searchPanelId}
      emptyMessage="No sales."
      filteredEmptyMessage="No sales match."
      sideList={{
        href: (sale) => `/dashboard/auction/sales/${encodeURIComponent(saleNoKey(sale.saleNo) || sale.saleNo)}`,
        isActive: (sale) => saleNoMatches(sale.saleNo, currentSaleNo),
        sortColumnKey: "saleNo",
        searchLabel: "Search",
        showSelectionSummary: false,
        content: (sale, { active }) => (
          <>
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold tabular-nums text-green-700 dark:text-green-400">{sale.saleNo}</span>
              <span className="flex items-center gap-2">
                {sale.reprintRegister && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    Re-print reg.
                  </span>
                )}
                {active && <span className="text-stone-400">‹</span>}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{sale.brokers.join(", ") || "—"}</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className="tabular-nums text-stone-500 dark:text-stone-400">{sale.dispatchNos.length} dispatch invoice{sale.dispatchNos.length === 1 ? "" : "s"}</span>
              <span className="text-stone-500 dark:text-stone-400">{sale.saleDate ?? "—"}</span>
            </div>
          </>
        ),
      }}
    />
  );
}
