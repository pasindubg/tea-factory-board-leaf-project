"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DetailField,
  DetailRecordPanel,
  DetailWorkspace,
} from "@/components/detail-workspace";
import { showAppToast } from "@/components/action-feedback";
import { startNavigationFeedback } from "@/components/navigation-progress";
import { createBundledDispatch, deleteBundledDispatch } from "../actions";
import { BundledDispatchForm, type EligibleBrokerInvoice, type WarehouseOption } from "./bundled-dispatch-form";
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

/** Data loading and mapping stay in the route; this component owns the
 * reusable detail UI plus the "New dispatch" creation workflow, which lives
 * here (not a separate overview page) exactly like the broker-invoice
 * detail page owns its own "New invoice" workflow. */
export function DispatchDetailView({
  dispatch,
  dispatches,
  invoices,
  lots,
  eligibleInvoices,
  warehouses,
  canCreate,
  isOwner,
}: {
  dispatch: DispatchDetailHeader;
  dispatches: PhysicalDispatchListRow[];
  invoices: DispatchInvoiceRow[];
  lots: DispatchLotRow[];
  eligibleInvoices: EligibleBrokerInvoice[];
  warehouses: WarehouseOption[];
  canCreate: boolean;
  isOwner: boolean;
}) {
  const [creatingDispatch, setCreatingDispatch] = useState(false);
  const router = useRouter();
  const status = dispatch.status === "dispatched" ? "dispatched" : "draft";

  const hasEligibleInvoices = eligibleInvoices.length >= 2;
  const hasActiveWarehouse = warehouses.some((warehouse) => warehouse.active);
  const createEnabled = canCreate && hasEligibleInvoices && hasActiveWarehouse;
  const createDisabledReason = !canCreate
    ? "Only owners and managers can create physical dispatches."
    : !hasActiveWarehouse
      ? "Add an active warehouse in Warehouse Basic Data first."
      : !hasEligibleInvoices
        ? "At least two unbundled Broker Invoices are required."
        : undefined;

  async function createNewDispatch(formData: FormData) {
    const result = await createBundledDispatch(formData);
    if (!result.ok) {
      showAppToast(result.error, "error");
      return;
    }
    showAppToast(result.notice ?? "Dispatch created.");
    if (result.id) {
      startNavigationFeedback();
      router.push(`/dashboard/auction/dispatches/${result.id}`);
    }
    setCreatingDispatch(false);
  }

  return (
    <DetailWorkspace
      rail={
        <DispatchSideList
          rows={dispatches}
          currentId={creatingDispatch ? "" : dispatch.id}
          searchPanelId={SEARCH_PANEL_ID}
          onCreate={createEnabled ? () => setCreatingDispatch(true) : undefined}
          createDisabledReason={createDisabledReason}
        />
      }
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
      deleteAction={isOwner && !creatingDispatch ? {
        title: "Delete this dispatch?",
        description: "This removes the physical dispatch. Its broker invoices are not deleted — they become unbundled and eligible for a new dispatch again. This cannot be undone.",
        confirmLabel: "Delete dispatch",
        errorMessage: "Could not delete this dispatch. Please try again.",
        action: () => deleteBundledDispatch(dispatch.id),
        onSuccess: () => {
          startNavigationFeedback();
          router.replace("/dashboard/auction/dispatches/details");
        },
      } : undefined}
    >
      {creatingDispatch ? (
        <DetailRecordPanel
          tone="draft"
          eyebrow="New dispatch"
          title="Create physical dispatch"
          description="Bundle eligible Broker Invoices into a new outbound dispatch."
          contentClassName="pt-5"
        >
          <BundledDispatchForm
            invoices={eligibleInvoices}
            warehouses={warehouses}
            action={createNewDispatch}
            onCancel={() => setCreatingDispatch(false)}
          />
        </DetailRecordPanel>
      ) : (
        <>
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
        </>
      )}
    </DetailWorkspace>
  );
}
