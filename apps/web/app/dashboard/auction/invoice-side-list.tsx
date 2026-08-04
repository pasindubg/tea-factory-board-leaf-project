"use client";

import { EntityList } from "@/components/entity-list";
import type { ColumnDef, ListDefinition } from "@/components/list-controls";
import type { AuctionDispatchListRow } from "@/lib/list-resources";
import { createDispatchWithId } from "./actions";
import { formatSaleNo } from "./sale-number";
import { stateBucket } from "./state-buckets";

export type DispatchListItem = AuctionDispatchListRow;

export const INVOICE_SEARCH_PANEL_ID = "invoice-overview-search";

/** Later lifecycle states are all presented as "catalogued" on this rail. */
export function cappedDispatchStatus(status: string | null) {
  return ["valued", "sold", "settled", "broker_statement"].includes(status ?? "") ? "catalogued" : status;
}

const DISPATCH_LIST_COLUMNS: ColumnDef<DispatchListItem>[] = [
  { key: "sale_no", label: "Broker invoice", accessor: (row) => row.sale_no ?? null, sortable: true, filter: "text" },
  { key: "broker", label: "Broker", accessor: (row) => row.brokers?.name ?? null, sortable: true, filter: "select" },
  { key: "target_sale_no", label: "Sale", accessor: (row) => row.target_sale_no ?? null, sortable: true, filter: "text" },
  { key: "dispatch_date", label: "Invoice date", accessor: (row) => row.dispatch_date ?? null, sortable: true, searchInput: "date" },
  { key: "sale_date", label: "Sale date", accessor: (row) => row.sale_date ?? null, sortable: true, searchInput: "date" },
  { key: "status", label: "Status", accessor: (row) => stateBucket(cappedDispatchStatus(row.status)).label, sortable: true, filter: "select" },
];

const DISPATCH_LIST = {
  columns: DISPATCH_LIST_COLUMNS,
  selectionMode: "single",
  add: true,
  edit: false,
  delete: false,
} satisfies ListDefinition<DispatchListItem>;

/**
 * The broker-invoice rail shared by the invoice detail page and the
 * first-invoice bootstrap page, so both render the same workspace layout.
 * `onCreate` is omitted where a create form is already on screen.
 */
export function InvoiceSideList({
  rows,
  currentId,
  currentDisplayStatus = null,
  onSelect,
  onCreate,
}: {
  rows: DispatchListItem[];
  currentId: string;
  currentDisplayStatus?: string | null;
  onSelect?: () => void;
  onCreate?: () => void;
}) {
  return (
    <EntityList
      resource={{ key: "auction.dispatches" }}
      initialRows={rows}
      definition={{ ...DISPATCH_LIST, add: Boolean(onCreate) }}
      getId={(row) => row.id}
      rowLabel={(row) => `Broker invoice ${row.sale_no ?? "unknown"}`}
      canCreate={Boolean(onCreate)}
      create={onCreate ? {
        action: createDispatchWithId,
        disabledReason: "Finish creating the current broker invoice first.",
        onOpen: onCreate,
      } : undefined}
      chrome="records-only"
      searchPanelId={INVOICE_SEARCH_PANEL_ID}
      className="h-full min-h-0 xl:flex-col"
      emptyMessage="No broker invoices."
      filteredEmptyMessage="No broker invoices match."
      sideList={{
        href: (dispatch) => `/dashboard/auction/${dispatch.id}`,
        onSelect,
        isActive: (dispatch) => dispatch.id === currentId,
        sortColumnKey: "sale_no",
        searchLabel: "Search",
        showSelectionSummary: false,
        content: (dispatch, { active }) => {
          const bucket = stateBucket(active ? currentDisplayStatus : cappedDispatchStatus(dispatch.status));
          return (
            <>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold tabular-nums text-green-700 dark:text-green-400">{dispatch.sale_no ?? "—"}</span>
                {active && <span className="text-stone-400">‹</span>}
              </div>
              <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{dispatch.brokers?.name ?? "—"}</p>
              {dispatch.selling_mark && (
                <p className="mt-0.5 truncate text-xs text-stone-400 dark:text-stone-500">{dispatch.selling_mark}</p>
              )}
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="truncate tabular-nums text-stone-500 dark:text-stone-400">
                  Sale {formatSaleNo(dispatch.target_sale_no) || "—"}
                  {dispatch.dispatch_date ? ` · ${dispatch.dispatch_date}` : ""}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 ${bucket.style}`}>{bucket.label}</span>
              </div>
            </>
          );
        },
      }}
    />
  );
}
