import { DispatchDetailLists, type DispatchInvoiceRow, type DispatchLotRow } from "./dispatch-detail-lists";
import type { PhysicalDispatchListRow } from "./dispatch-list";
import { DispatchSideList } from "./dispatch-side-list";

type DispatchDetailHeader = {
  id: string;
  dispatchNo: string;
  dateFrom: string;
  dateTo: string;
  warehouse: string;
  status: string;
};

function dateRange(from: string, to: string) {
  return from === to ? from : `${from} – ${to}`;
}

/** Presentation-only format for a physical dispatch record. Data loading and
 * mapping stay in the route, while this component owns the reusable detail UI. */
export function DispatchDetailView({
  dispatch,
  dispatches,
  invoices,
  lots,
}: {
  dispatch: DispatchDetailHeader;
  dispatches: PhysicalDispatchListRow[];
  invoices: DispatchInvoiceRow[];
  lots: DispatchLotRow[];
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <DispatchSideList rows={dispatches} currentId={dispatch.id} />
      <div className="min-w-0 space-y-6">
        <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-700 dark:bg-stone-900">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-stone-500 dark:text-stone-400">Dispatch details</p><h2 className="mt-1 font-mono text-2xl font-semibold text-stone-800 dark:text-stone-100">{dispatch.dispatchNo}</h2></div><span className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-300">{dispatch.status}</span></div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-stone-500 dark:text-stone-400">Dispatch date(s)</dt><dd className="mt-1 font-medium text-stone-800 dark:text-stone-100">{dateRange(dispatch.dateFrom, dispatch.dateTo)}</dd></div><div><dt className="text-xs text-stone-500 dark:text-stone-400">Warehouse</dt><dd className="mt-1 font-medium text-stone-800 dark:text-stone-100">{dispatch.warehouse}</dd></div><div><dt className="text-xs text-stone-500 dark:text-stone-400">Broker Invoices</dt><dd className="mt-1 font-medium text-stone-800 dark:text-stone-100">{invoices.length}</dd></div><div><dt className="text-xs text-stone-500 dark:text-stone-400">Lots</dt><dd className="mt-1 font-medium text-stone-800 dark:text-stone-100">{lots.length}</dd></div></dl>
        </div>
        <DispatchDetailLists lots={lots} invoices={invoices} />
      </div>
    </div>
  );
}
