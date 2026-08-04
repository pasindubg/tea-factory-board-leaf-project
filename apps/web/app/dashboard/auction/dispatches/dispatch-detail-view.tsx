"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  DetailField,
  DetailRecordPanel,
  DetailWorkspace,
} from "@/components/detail-workspace";
import { showAppToast } from "@/components/action-feedback";
import { startNavigationFeedback } from "@/components/navigation-progress";
import { SubmitButton } from "@/components/submit-button";
import { AppButton } from "@/components/ui/button";
import { completeDispatchGrn, createBundledDispatch, deleteBundledDispatch, markDispatchDispatched, updateBundledDispatch } from "../actions";
import { brokerInvoiceRank, canMarkDispatched, canRecordDispatchGrn, type DispatchStatus } from "../dispatch-status";
import { BundledDispatchForm, type EligibleBrokerInvoice, type WarehouseOption } from "./bundled-dispatch-form";
import { DispatchDetailLists, type DispatchInvoiceRow, type DispatchLotRow } from "./dispatch-detail-lists";
import type { PhysicalDispatchListRow } from "./dispatch-list";
import { DispatchSideList } from "./dispatch-side-list";

const SEARCH_PANEL_ID = "physical-dispatch-detail-search";

const editInputClass = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-stone-800 focus:border-green-600 focus:outline-none dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:focus:border-green-500";

type DispatchDetailHeader = {
  id: string;
  dispatchNo: string;
  dateFrom: string;
  dateTo: string;
  warehouse: string;
  status: DispatchStatus;
  createdAt: string | null;
};

function dateRange(from: string, to: string) {
  return from === to ? from : `${from} – ${to}`;
}

/** created_at is a timestamp; only the calendar day is meaningful here. */
function createdDate(value: string | null) {
  return value ? value.slice(0, 10) : "—";
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
  const [isEditing, setIsEditing] = useState(false);
  const [markingDispatched, setMarkingDispatched] = useState(false);
  const [recordingGrn, setRecordingGrn] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  // The status is derived server-side; the page only renders it. "Dispatched"
  // and "GRN" are the only two commands a person triggers — received (once
  // recorded) and catalogued follow automatically from the broker invoices
  // inside the dispatch.
  const status = dispatch.status;
  const canDispatch = canMarkDispatched(status);
  const canRecordGrn = canRecordDispatchGrn(status);

  async function markDispatched() {
    setMarkingDispatched(true);
    try {
      const result = await markDispatchDispatched(dispatch.id);
      if (!result.ok) {
        showAppToast(result.error, "error");
        return;
      }
      showAppToast(result.notice ?? "Dispatch marked as dispatched.");
      router.refresh();
    } finally {
      setMarkingDispatched(false);
    }
  }

  async function recordGrn() {
    setRecordingGrn(true);
    try {
      const result = await completeDispatchGrn(dispatch.id);
      if (!result.ok) {
        showAppToast(result.error, "error");
        return;
      }
      showAppToast(result.notice ?? "GRN recorded.");
      router.refresh();
    } finally {
      setRecordingGrn(false);
    }
  }

  // The dispatch stores its warehouse by name, so the LOV is preselected by
  // matching that name back to an id.
  const currentWarehouseId = warehouses.find((warehouse) => warehouse.name === dispatch.warehouse)?.id ?? "";

  async function saveDispatch(formData: FormData) {
    const result = await updateBundledDispatch(dispatch.id, formData);
    if (!result.ok) {
      showAppToast(result.error, "error");
      return;
    }
    showAppToast(result.notice ?? "Dispatch updated.");
    setIsEditing(false);
    router.refresh();
  }

  const grnCount = invoices.filter((invoice) => brokerInvoiceRank(invoice.status) >= brokerInvoiceRank("grn")).length;
  const cataloguedCount = invoices.filter((invoice) => brokerInvoiceRank(invoice.status) >= brokerInvoiceRank("catalogued")).length;

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
        menuLabel: "State",
        // All four stages are always shown so the dispatcher can see what is
        // still ahead, even though only two of them are ever clicked.
        steps: [
          { key: "draft", label: "Draft", metric: `${invoices.length} broker invoices` },
          { key: "dispatched", label: "Dispatched", metric: `${lots.length} lots` },
          { key: "received", label: "Received", metric: `${grnCount}/${invoices.length} at GRN` },
          { key: "catalogued", label: "Catalogued", metric: `${cataloguedCount}/${invoices.length} acknowledged` },
        ],
        commands: [
          {
            id: "mark-dispatched",
            label: markingDispatched ? "Marking…" : "Dispatched",
            disabled: !canDispatch || markingDispatched || creatingDispatch,
            busy: markingDispatched,
            busyLabel: "Marking…",
            onSelect: markDispatched,
          },
          {
            id: "record-grn",
            label: recordingGrn ? "Recording…" : "GRN",
            disabled: !canRecordGrn || recordingGrn || creatingDispatch,
            busy: recordingGrn,
            busyLabel: "Recording…",
            onSelect: recordGrn,
          },
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
          <form ref={formRef} action={saveDispatch}>
            <DetailRecordPanel
              eyebrow="Dispatch details"
              title={`Dispatch Details · ${dispatch.dispatchNo}`}
              description={`${dateRange(dispatch.dateFrom, dispatch.dateTo)} · ${dispatch.warehouse}`}
              contentClassName="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              actions={
                /* Editing a dispatch is owner-only, matching its delete. */
                isOwner ? (
                  isEditing ? (
                    <>
                      <AppButton
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          formRef.current?.reset();
                          setIsEditing(false);
                        }}
                      >
                        Cancel
                      </AppButton>
                      <SubmitButton variant="primary" pendingText="Saving…">
                        Save
                      </SubmitButton>
                    </>
                  ) : (
                    <AppButton type="button" variant="secondary" onClick={() => setIsEditing(true)}>
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                      Edit
                    </AppButton>
                  )
                ) : undefined
              }
            >
              {isEditing ? (
                <>
                  <label className="grid min-w-0 gap-1.5 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
                    Dispatch date from
                    <input
                      type="date"
                      name="dispatch_date_from"
                      defaultValue={dispatch.dateFrom}
                      required
                      className={editInputClass}
                    />
                  </label>
                  <label className="grid min-w-0 gap-1.5 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
                    Dispatch date to
                    <input
                      type="date"
                      name="dispatch_date_to"
                      defaultValue={dispatch.dateTo}
                      required
                      className={editInputClass}
                    />
                  </label>
                  <label className="grid min-w-0 gap-1.5 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
                    Warehouse
                    <select
                      name="warehouse_id"
                      defaultValue={currentWarehouseId}
                      required
                      className={editInputClass}
                    >
                      <option value="" disabled>Select a warehouse…</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id} disabled={!warehouse.active}>
                          {warehouse.name}{warehouse.active ? "" : " (Inactive)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {/* System-assigned, so it stays read-only while editing. */}
                  <DetailField label="Created date" value={createdDate(dispatch.createdAt)} />
                </>
              ) : (
                <>
                  <DetailField label="Dispatch date(s)" value={dateRange(dispatch.dateFrom, dispatch.dateTo)} />
                  <DetailField label="Created date" value={createdDate(dispatch.createdAt)} />
                  <DetailField label="Warehouse" value={dispatch.warehouse} />
                  <DetailField label="Broker invoices" value={invoices.length} />
                  <DetailField label="Lots" value={lots.length} />
                </>
              )}
            </DetailRecordPanel>
          </form>
          <DispatchDetailLists lots={lots} invoices={invoices} />
        </>
      )}
    </DetailWorkspace>
  );
}
