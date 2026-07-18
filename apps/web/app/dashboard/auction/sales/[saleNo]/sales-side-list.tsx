"use client";

import { EntityList } from "@/components/entity-list";
import type { ColumnDef, ListDefinition } from "@/components/list-controls";
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

const LIST = { columns: COLUMNS, selectionMode: "single" } satisfies ListDefinition<SaleSideListRow>;

export function SalesSideList({ rows, currentSaleNo }: { rows: SaleSideListRow[]; currentSaleNo: string }) {
  return (
    <EntityList
      scope="auction-sales-side-list"
      initialRows={rows}
      definition={LIST}
      getId={(row) => saleNoKey(row.saleNo) || row.saleNo}
      rowLabel={(row) => `Sale ${row.saleNo}`}
      title="Sales"
      className="xl:sticky xl:top-0 xl:h-[calc(100dvh-8rem)] xl:min-h-[34rem] xl:flex-col"
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
              {active && <span className="text-stone-400">‹</span>}
            </div>
            <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{sale.brokers.join(", ") || "—"}</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className="tabular-nums text-stone-500 dark:text-stone-400">{sale.dispatchNos.length} broker invoice{sale.dispatchNos.length === 1 ? "" : "s"}</span>
              <span className="text-stone-500 dark:text-stone-400">{sale.saleDate ?? "—"}</span>
            </div>
          </>
        ),
      }}
    />
  );
}
