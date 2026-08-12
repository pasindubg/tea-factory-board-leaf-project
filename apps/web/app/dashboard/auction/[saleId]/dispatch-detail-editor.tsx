"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Printer } from "lucide-react";
import {
  DetailEmptyPanel,
  DetailField,
  DetailLovField,
  DetailRecordPanel,
  DetailWorkspace,
} from "@/components/detail-workspace";
import { startNavigationFeedback } from "@/components/navigation-progress";
import { SubmitButton } from "@/components/submit-button";
import { AppButton } from "@/components/ui/button";
import { AppDrawer } from "@/components/ui/drawer";
import { showAppToast } from "@/components/action-feedback";
import {
  completeGrn,
  confirmDispatchDraft,
  createDispatchWithId,
  deleteSale,
  updateSale,
} from "../actions";
import { isOpenDraft, stateBucket } from "../state-buckets";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";
import {
  InvoiceSideList,
  INVOICE_SEARCH_PANEL_ID,
  cappedDispatchStatus,
  type DispatchListItem,
} from "../invoice-side-list";
import { buildCompositeInvoiceNo, parseCompositeInvoiceNo, type InvoicePrefixOption } from "../invoice-number";
import { BrokerInvoicePrintout } from "./broker-invoice-printout";
import { LotsSection } from "./lots-section";
import type { LotRow } from "./lot-row";
import { NewDispatchFields, type DispatchCreationOptions } from "../new-dispatch-form";

type SaleDetail = {
  id: string;
  sale_no: string | null;
  target_sale_no: string | null;
  dispatch_date: string | null;
  sale_date: string | null;
  prompt_date: string | null;
  status: string | null;
  selling_mark_id: string | null;
  selling_mark: string | null;
  broker_lorry_no: string | null;
  driver_name: string | null;
  transporter: string | null;
  bundle_dispatch_no: string | null;
  created_date: string | null;
};

type MarkOption = { id: string; code: string; name: string | null };
type GradeOption = { code: string; name: string; sampleWeight: number | null; defaultKgPerBag: number | null };
type DispatchStats = {
  totalLots: number;
  cataloguedLots: number;
  issueLots: number;
  reprintLots: number;
};
type DispatchStep = {
  key: string;
  label: string;
  metric: (stats: DispatchStats) => string;
};

const DISPATCH_STEPS: DispatchStep[] = [
  { key: "draft", label: "Draft", metric: (stats) => `${stats.totalLots} lots` },
  { key: "invoiced", label: "Invoiced", metric: (stats) => `${stats.totalLots} lot invoices` },
  { key: "grn", label: "GRN", metric: () => "Document or manual" },
  { key: "catalogued", label: "Catalogued", metric: (stats) => `${stats.cataloguedLots}/${stats.totalLots} lots` },
];

function statusIndex(status: string | null) {
  const normalizedStatus = status === "dispatched" ? "draft" : status;
  const index = DISPATCH_STEPS.findIndex((step) => step.key === normalizedStatus);
  return index >= 0 ? index : 0;
}

function effectiveDispatchStatus(status: string | null, stats: DispatchStats) {
  if (stats.cataloguedLots > 0) return "catalogued";
  return status === "dispatched" ? "draft" : status;
}


export function DispatchDetailEditor({
  sale,
  dispatches,
  broker,
  rows,
  marks,
  grades,
  isOwner,
  soldLotIds,
  lotPrefixes,
  creation,
}: {
  sale: SaleDetail;
  dispatches: DispatchListItem[];
  broker: string;
  rows: LotRow[];
  marks: MarkOption[];
  grades: GradeOption[];
  isOwner: boolean;
  soldLotIds: string[];
  lotPrefixes: InvoicePrefixOption[];
  creation: DispatchCreationOptions;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [printAfterConfirm, setPrintAfterConfirm] = useState(false);
  const [grnOpen, setGrnOpen] = useState(false);
  const [liveRows, setLiveRows] = useState(rows);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const isDraftStatus = isOpenDraft(sale.status);
  // The owner can edit or delete a broker invoice in any state. Everyone else
  // may do so only while it is still an unconfirmed draft — once confirmed it
  // is downstream financial work and stops being theirs to change.
  const canDelete = isOwner || isDraftStatus;
  const canEditDetails = isOwner || isDraftStatus;
  const canConfirmDraft = !creatingInvoice && !isEditing && isDraftStatus;
  const canAddLots = isOwner || isDraftStatus;
  const cataloguedLots = liveRows.filter((row) => ["acknowledged", "pending", "missing", "shutout", "not-valued", "withdrawn", "re-print", "valued", "sold", "settled"].includes(row.state ?? "") || soldLotIds.includes(row.id)).length;
  const issueLots = liveRows.filter((row) => ["pending", "missing", "shutout", "not-valued", "withdrawn"].includes(row.state ?? "")).length;
  const reprintLots = liveRows.filter((row) => row.state === "re-print").length;
  const appliedThresholdGrades = new Set(liveRows.filter((row) => row.threshold_applies).map((row) => row.grade).filter(Boolean));
  const invoiceCount = new Set(
    liveRows.flatMap((row) =>
      row.lot_invoices?.length ? row.lot_invoices.map((invoice) => invoice.invoice_no) : row.invoice_no ? [row.invoice_no] : [],
    ),
  ).size;
  const totalBags = liveRows.reduce((sum, row) => sum + Number(row.bags ?? 0), 0);
  const totalNetWt = liveRows.reduce((sum, row) => sum + Number(row.net_wt ?? 0), 0);
  const dispatchStats: DispatchStats = {
    totalLots: liveRows.length,
    cataloguedLots,
    issueLots,
    reprintLots,
  };
  const displayStatus = effectiveDispatchStatus(sale.status, dispatchStats);
  const currentStatusIndex = statusIndex(displayStatus);
  const canProceedToGrn =
    !creatingInvoice &&
    !isEditing &&
    currentStatusIndex === statusIndex("invoiced");
  const handleRowsChange = useCallback((nextRows: LotRow[]) => setLiveRows(nextRows), []);

  useEffect(() => setLiveRows(rows), [rows]);

  async function saveDispatch(formData: FormData) {
    const result = await updateSale(sale.id, formData);
    if (!result.ok) {
      showAppToast(result.error, "error");
      return;
    }
    setIsEditing(false);
    router.refresh();
  }

  async function confirmDraft() {
    setIsConfirming(true);
    try {
      const result = await confirmDispatchDraft(sale.id);
      if (!result.ok) {
        showAppToast(result.error, "error");
        return;
      }
      setPrintAfterConfirm(true);
      router.refresh();
    } finally {
      setIsConfirming(false);
    }
  }

  // Confirming a draft hands the invoice straight to the printer. It waits for
  // the refreshed status to arrive rather than printing immediately, so the
  // sheet shows the confirmed invoice and not the draft it was a moment ago.
  useEffect(() => {
    if (!printAfterConfirm || isOpenDraft(sale.status)) return;
    setPrintAfterConfirm(false);
    const timer = window.setTimeout(() => window.print(), 0);
    return () => window.clearTimeout(timer);
  }, [printAfterConfirm, sale.status]);

  async function createNewDispatch(formData: FormData) {
    const result = await createDispatchWithId(formData);
    if (!result.ok) {
      showAppToast(result.error, "error");
      return;
    }
    showAppToast(result.notice ?? "Broker invoice created.");
    if (result.id) {
      startNavigationFeedback();
      router.push(`/dashboard/auction/${result.id}`);
    }
  }

  // Prefix-aware live preview: only bump the sequence among dispatches that
  // share the same suggested prefix (an older/abnormal prefix's numbers don't
  // affect this one's next available number).
  const suggested = parseCompositeInvoiceNo(creation.nextDispatchNo);
  const suggestedPrefix = suggested?.prefix ?? "";
  const suggestedSeq = Number(suggested?.seq ?? "0") || 0;
  const latestSeq = dispatches.reduce((maximum, row) => {
    const parsed = parseCompositeInvoiceNo(row.sale_no);
    if (!parsed || parsed.prefix !== suggestedPrefix) return maximum;
    return Math.max(maximum, Number(parsed.seq) || 0);
  }, 0);
  const liveCreation: DispatchCreationOptions = {
    ...creation,
    nextDispatchNo: suggestedPrefix
      ? buildCompositeInvoiceNo(suggestedPrefix, Math.max(suggestedSeq, latestSeq + 1))
      : creation.nextDispatchNo,
    dispatchHistory: dispatches.map((row) => ({
      saleNo: row.sale_no,
      targetSaleNo: row.target_sale_no,
      dispatchDate: row.dispatch_date,
      saleDate: row.sale_date,
    })),
  };
  const visibleStats = creatingInvoice
    ? { totalLots: 0, cataloguedLots: 0, issueLots: 0, reprintLots: 0 }
    : dispatchStats;
  const visibleStatusIndex = creatingInvoice ? 0 : currentStatusIndex;
  const visibleStateKey =
    DISPATCH_STEPS[visibleStatusIndex]?.key ?? DISPATCH_STEPS[0]!.key;

  return (
    <>
    <DetailWorkspace
      railAriaLabel="Broker invoices"
      rail={
        <InvoiceSideList
          rows={dispatches}
          currentId={creatingInvoice ? "" : sale.id}
          currentDisplayStatus={displayStatus}
          onSelect={() => setCreatingInvoice(false)}
          onCreate={() => {
            setIsEditing(false);
            setCreatingInvoice(true);
          }}
        />
      }
      createAction={{
        label: "New invoice",
        title: creatingInvoice
          ? "A new invoice is already open"
          : "New invoice",
        disabled: creatingInvoice,
        onClick: () => {
          setIsEditing(false);
          setGrnOpen(false);
          setCreatingInvoice(true);
        },
      }}
      searchAction={{
        panelId: INVOICE_SEARCH_PANEL_ID,
        label: "Search",
      }}
      state={{
        currentKey: visibleStateKey,
        steps: DISPATCH_STEPS.map((step) => ({
          key: step.key,
          label: step.label,
          metric: step.metric(visibleStats),
        })),
        menuLabel: "State",
        testId: "invoice-state-indicator",
        commands: [
          {
            id: "confirm-invoice",
            label: isConfirming
              ? "Confirming…"
              : "Confirm",
            disabled: !canConfirmDraft || isConfirming,
            busy: isConfirming,
            busyLabel: "Confirming…",
            onSelect: confirmDraft,
          },
          {
            id: "record-grn",
            label: "GRN",
            disabled: !canProceedToGrn,
            onSelect: () => setGrnOpen(true),
          },
        ],
      }}
      deleteAction={
        canDelete && !creatingInvoice
          ? {
              label: "Delete",
              title: "Delete broker invoice?",
              description:
                "This removes the broker invoice and its operational lot records. Financial sale, VAT, or settlement records will safely block deletion instead. This cannot be undone.",
              confirmLabel: "Delete broker invoice",
              errorMessage:
                "Could not delete the broker invoice. Please try again.",
              action: () => deleteSale(sale.id),
              onSuccess: () => {
                startNavigationFeedback();
                // No overview list to fall back to — go to whichever other
                // broker invoice is now most recent, or the bootstrap/create
                // page if that was the last one.
                const remaining = dispatches.filter((row) => row.id !== sale.id);
                const latest = [...remaining].sort((a, b) => {
                  const byDate = String(b.dispatch_date ?? "").localeCompare(String(a.dispatch_date ?? ""));
                  return byDate !== 0 ? byDate : String(b.sale_no ?? "").localeCompare(String(a.sale_no ?? ""));
                })[0];
                router.replace(latest ? `/dashboard/auction/${latest.id}` : "/dashboard/auction/new");
              },
            }
          : undefined
      }
    >
      {creatingInvoice ? (
        <form action={createNewDispatch}>
          <DetailRecordPanel
            tone="draft"
            eyebrow="Draft broker invoice"
            title={`Broker Invoice Details · ${liveCreation.nextDispatchNo}`}
            description="Enter the invoice details here. The workspace stays in place after saving."
            contentClassName="pt-5"
            actions={
              <>
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={() => setCreatingInvoice(false)}
                >
                  Cancel
                </AppButton>
                <SubmitButton variant="primary" pendingText="Saving…">
                  Save
                </SubmitButton>
              </>
            }
          >
            <NewDispatchFields {...liveCreation} />
          </DetailRecordPanel>
        </form>
      ) : (
        <form ref={formRef} action={saveDispatch}>
          <DetailRecordPanel
            eyebrow="Broker invoice details"
            title={`Broker Invoice Details · ${sale.sale_no}`}
            description={
              <>
                {broker}
                {sale.dispatch_date ? ` · invoiced ${sale.dispatch_date}` : ""}
                {sale.sale_date ? ` · sale ${sale.sale_date}` : ""}
              </>
            }
            contentClassName=""
            actions={
              <>
                {!isEditing ? (
                  <AppButton
                    type="button"
                    variant="secondary"
                    onClick={() => window.print()}
                  >
                    <Printer aria-hidden="true" className="h-4 w-4" />
                    Print
                  </AppButton>
                ) : null}
                {canEditDetails && !isEditing ? (
                  <AppButton
                    type="button"
                    variant="secondary"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                    Edit
                  </AppButton>
                ) : null}
                {isEditing ? (
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
                ) : null}
              </>
            }
            footer="Lot invoices are managed in the list directly below."
          >
            <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
              <DetailField label="Broker" value={broker} />
              <DetailField
                label="Broker invoice"
                value={sale.sale_no ?? "—"}
              />
              <DetailField
                label="Created date"
                value={sale.created_date ?? "—"}
              />
              <DetailField
                label="Bundle dispatch"
                value={sale.bundle_dispatch_no ?? "—"}
              />
              <DetailField
                label="Dispatch date"
                value={sale.dispatch_date ?? "—"}
              />
              <SellingMarkField
                defaultValue={sale.selling_mark_id ?? ""}
                displayValue={sale.selling_mark ?? "—"}
                disabled={!isEditing}
              />
              <CompactField
                label="Lorry no."
                name="broker_lorry_no"
                defaultValue={sale.broker_lorry_no ?? ""}
                disabled={!isEditing}
              />
              <CompactField
                label="Driver"
                name="driver_name"
                defaultValue={sale.driver_name ?? ""}
                disabled={!isEditing}
              />
              <CompactField
                label="Transporter"
                name="transporter"
                defaultValue={sale.transporter ?? ""}
                disabled={!isEditing}
              />
              <CompactField
                label="Sale no."
                name="target_sale_no"
                defaultValue={sale.target_sale_no ?? ""}
                format="sale-no"
                disabled={!isEditing}
              />
              <CompactField
                label="Sale date"
                name="sale_date"
                type="date"
                defaultValue={sale.sale_date ?? ""}
                disabled={!isEditing}
              />
              <DetailField label="Invoices" value={`${invoiceCount}`} />
              <DetailField label="Total bags" value={`${totalBags}`} />
              <DetailField label="Net weight" value={`${totalNetWt.toFixed(2)} kg`} />
              <DetailField label="Issues" value={`${issueLots} lots`} />
              <DetailField label="Re-print" value={`${reprintLots} lots`} />
              <DetailField
                label="Min kg rules"
                value={
                  appliedThresholdGrades.size > 0
                    ? `${appliedThresholdGrades.size} applied`
                    : "Not applied"
                }
              />
            </div>
          </DetailRecordPanel>
        </form>
      )}

      {creatingInvoice ? (
        <DetailEmptyPanel
          title="Lot invoices"
          description="Save the broker invoice before adding its lot rows."
        />
      ) : (
        <LotsSection
          rows={rows}
          saleId={sale.id}
          isOwner={isOwner}
          grades={grades}
          lotPrefixes={lotPrefixes}
          canEdit={canAddLots}
          canAdd={canAddLots}
          soldLotIds={soldLotIds}
          title="Lot invoices"
          onRowsChange={handleRowsChange}
        />
      )}
    </DetailWorkspace>
    <AppDrawer
      open={grnOpen && canProceedToGrn}
      title={`GRN · ${sale.sale_no ?? "Broker invoice"}`}
      description="Upload a GRN document or continue without one."
      onClose={() => setGrnOpen(false)}
    >
      <form action={completeGrn.bind(null, sale.id)} className="grid gap-5">
        <label className="grid gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
          GRN image or PDF
          <input
            type="file"
            name="grn_file"
            accept="image/*,application/pdf"
            className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-normal text-stone-700 file:mr-3 file:rounded-md file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-stone-800 hover:file:bg-stone-200 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:file:bg-stone-800 dark:file:text-stone-100"
          />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <SubmitButton variant="secondary" pendingText="Proceeding…">
            Skip GRN
          </SubmitButton>
          <SubmitButton variant="primary" pendingText="Saving…">
            Save GRN
          </SubmitButton>
        </div>
      </form>
    </AppDrawer>
    {/* Off-screen; only the print stylesheet ever lays this out. Skipped while
        creating a new invoice, which has nothing to print yet. */}
    {!creatingInvoice && (
      <BrokerInvoicePrintout
        saleNo={sale.sale_no}
        broker={broker}
        sellingMark={sale.selling_mark}
        dispatchDate={sale.dispatch_date}
        saleDate={sale.sale_date}
        promptDate={sale.prompt_date}
        targetSaleNo={sale.target_sale_no}
        transporter={sale.transporter}
        brokerLorryNo={sale.broker_lorry_no}
        driverName={sale.driver_name}
        bundleDispatchNo={sale.bundle_dispatch_no}
        status={displayStatus}
        rows={liveRows}
      />
    )}
    </>
  );
}


function CompactField({
  label,
  name,
  defaultValue,
  type = "text",
  format,
  disabled = false,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  format?: "four-digit" | "sale-no";
  disabled?: boolean;
}) {
  if (disabled) {
    return <DetailField label={label} value={defaultValue || "—"} />;
  }
  return (
    <div className="grid min-w-0 gap-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        onBlur={(event) => {
          if (format === "four-digit") event.currentTarget.value = formatFourDigitNo(event.currentTarget.value);
          if (format === "sale-no") event.currentTarget.value = formatSaleNo(event.currentTarget.value);
        }}
        className="h-9 min-w-0 w-full rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/20 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
      />
    </div>
  );
}

function SellingMarkField({
  defaultValue,
  displayValue,
  disabled,
}: {
  defaultValue: string;
  displayValue: string;
  disabled: boolean;
}) {
  if (disabled) {
    return <DetailField label="Selling mark" value={displayValue} />;
  }
  return (
    <DetailLovField
      label="Selling mark"
      source="auction.marks"
      name="selling_mark_id"
      required
      defaultValue={defaultValue}
      // The record already reads as "MF1530 — KUMUDU"; keep that showing until
      // the user picks a different mark.
      defaultLabel={displayValue === "—" ? "" : displayValue}
    />
  );
}
