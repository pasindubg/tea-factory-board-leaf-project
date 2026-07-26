import {
  DetailField,
  DetailRecordPanel,
  DetailWorkspace,
} from "@/components/detail-workspace";
import { DispatchDetailLists, type DispatchInvoiceRow, type DispatchLotRow } from "./dispatch-detail-lists";
import type { PhysicalDispatchListRow } from "./dispatch-list";
import { DispatchSideList } from "./dispatch-side-list";

const SEARCH_PANEL_ID = "physical-dispatch-detail-search";

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
  const status = dispatch.status === "dispatched" ? "dispatched" : "draft";

  return (
    <DetailWorkspace
      rail={<DispatchSideList rows={dispatches} currentId={dispatch.id} searchPanelId={SEARCH_PANEL_ID} />}
      railAriaLabel="Physical dispatches"
      searchAction={{ panelId: SEARCH_PANEL_ID }}
      state={{
        currentKey: status,
        testId: "physical-dispatch-state-indicator",
        steps: [
          { key: "draft", label: "Draft", metric: `${invoices.length} broker invoices` },
          { key: "dispatched", label: "Dispatched", metric: `${lots.length} lots` },
        ],
      }}
    >
      <DetailRecordPanel
        eyebrow="Dispatch details"
        title={`Dispatch Details · ${dispatch.dispatchNo}`}
        description={`${dateRange(dispatch.dateFrom, dispatch.dateTo)} · ${dispatch.warehouse}`}
        contentClassName="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <DetailField label="Dispatch date(s)" value={dateRange(dispatch.dateFrom, dispatch.dateTo)} />
        <DetailField label="Warehouse" value={dispatch.warehouse} />
        <DetailField label="Broker invoices" value={invoices.length} />
        <DetailField label="Lots" value={lots.length} />
      </DetailRecordPanel>
      <DispatchDetailLists lots={lots} invoices={invoices} />
    </DetailWorkspace>
  );
}
