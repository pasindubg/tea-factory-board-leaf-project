"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { showAppToast } from "@/components/action-feedback";
import { EntityList } from "@/components/entity-list";
import type { ColumnDef, ListDefinition } from "@/components/list-controls";
import { completeGrn, confirmDispatchDraft, createDispatchWithId, updateSale } from "../actions";
import { stateBucket } from "../state-buckets";
import { formatFourDigitNo, formatSaleNo, saleNoKey } from "../sale-number";
import { DeleteDispatchButton } from "./delete-dispatch-button";
import { LotsSection } from "./lots-section";
import type { LotRow } from "./lot-row";
import type { AuctionDispatchListRow } from "@/lib/list-resources";
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
  bundle_dispatch_no: string | null;
  created_date: string | null;
};

type MarkOption = { id: string; code: string; name: string | null };
type GradeOption = { code: string; name: string };
type DispatchListItem = AuctionDispatchListRow;
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

const INVOICE_SEARCH_PANEL_ID = "invoice-overview-search";
const INVOICE_STATE_COMMANDS_ID = "invoice-state-commands";

function statusIndex(status: string | null) {
  const normalizedStatus = status === "dispatched" ? "draft" : status;
  const index = DISPATCH_STEPS.findIndex((step) => step.key === normalizedStatus);
  return index >= 0 ? index : 0;
}

function effectiveDispatchStatus(status: string | null, stats: DispatchStats) {
  if (stats.cataloguedLots > 0) return "catalogued";
  return status === "dispatched" ? "draft" : status;
}

function cappedDispatchStatus(status: string | null) {
  return ["valued", "sold", "settled", "broker_statement"].includes(status ?? "") ? "catalogued" : status;
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
  creation: DispatchCreationOptions;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [grnOpen, setGrnOpen] = useState(false);
  const [liveRows, setLiveRows] = useState(rows);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const canDelete = isOwner && (sale.status === "dispatched" || sale.status === "draft");
  const canEditDetails = isOwner;
  const isDraftStatus = sale.status === "draft" || sale.status === "dispatched";
  const canConfirmDraft = !creatingInvoice && !isEditing && isDraftStatus;
  const canAddLots = isOwner || isDraftStatus;
  const cataloguedLots = liveRows.filter((row) => ["acknowledged", "pending", "missing", "shutout", "not-valued", "withdrawn", "re-print", "valued", "sold", "settled"].includes(row.state ?? "") || soldLotIds.includes(row.id)).length;
  const issueLots = liveRows.filter((row) => ["pending", "missing", "shutout", "not-valued", "withdrawn"].includes(row.state ?? "")).length;
  const reprintLots = liveRows.filter((row) => row.state === "re-print").length;
  const appliedThresholdGrades = new Set(liveRows.filter((row) => row.threshold_applies).map((row) => row.grade).filter(Boolean));
  const dispatchStats: DispatchStats = {
    totalLots: liveRows.length,
    cataloguedLots,
    issueLots,
    reprintLots,
  };
  const displayStatus = effectiveDispatchStatus(sale.status, dispatchStats);
  const currentStatusIndex = statusIndex(displayStatus);
  const detailConfirmed = currentStatusIndex >= statusIndex("invoiced");
  const canProceedToGrn = !creatingInvoice && !isEditing && currentStatusIndex >= statusIndex("invoiced") && currentStatusIndex < statusIndex("catalogued");
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
      router.refresh();
    } finally {
      setIsConfirming(false);
    }
  }

  async function createNewDispatch(formData: FormData) {
    const result = await createDispatchWithId(formData);
    if (!result.ok) {
      showAppToast(result.error, "error");
      return;
    }
    showAppToast(result.notice ?? "Broker invoice created.");
    if (result.id) router.push(`/dashboard/auction/${result.id}`);
  }

  const latestSaleNo = dispatches.reduce(
    (maximum, row) => Math.max(maximum, Number(saleNoKey(row.sale_no)) || 0),
    0,
  );
  const liveCreation: DispatchCreationOptions = {
    ...creation,
    nextDispatchNo: formatFourDigitNo(
      Math.max(Number(saleNoKey(creation.nextDispatchNo)) || 0, latestSaleNo + 1),
    ),
    dispatchHistory: dispatches.map((row) => ({
      saleNo: row.sale_no,
      targetSaleNo: row.target_sale_no,
      dispatchDate: row.dispatch_date,
      saleDate: row.sale_date,
    })),
  };

  return (
    <div className="grid min-h-[calc(100dvh-8rem)] w-full items-start gap-6 xl:grid-cols-[clamp(13rem,18vw,20rem)_minmax(0,1fr)]">
      <InvoiceWorkspaceHeader
        creatingInvoice={creatingInvoice}
        currentIndex={currentStatusIndex}
        stats={dispatchStats}
        confirmed={detailConfirmed}
        isConfirming={isConfirming}
        canConfirm={canConfirmDraft}
        canProceedToGrn={canProceedToGrn}
        onCreate={() => {
          setIsEditing(false);
          setGrnOpen(false);
          setCreatingInvoice(true);
        }}
        onConfirm={confirmDraft}
        onOpenGrn={() => setGrnOpen(true)}
      />
      <DispatchSideList
        rows={dispatches}
        currentId={creatingInvoice ? "" : sale.id}
        currentDisplayStatus={displayStatus}
        onSelect={() => setCreatingInvoice(false)}
        onCreate={() => {
          setIsEditing(false);
          setCreatingInvoice(true);
        }}
      />
      <div className="min-w-0 space-y-5 xl:col-start-2 xl:row-start-2">
        {creatingInvoice ? (
          <form
            action={createNewDispatch}
            className="rounded-xl border border-green-200 bg-white p-5 shadow-sm dark:border-green-900 dark:bg-stone-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 pb-4 dark:border-stone-800">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-green-700 dark:text-green-400">Draft broker invoice</p>
                <h2 className="mt-1 text-xl font-semibold">Invoice Details · {liveCreation.nextDispatchNo}</h2>
                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                  Enter the invoice details here. The workspace stays in place after saving.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCreatingInvoice(false)}
                  className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 dark:border-stone-600 dark:text-stone-200"
                >
                  Cancel
                </button>
                <SubmitButton
                  pendingText="Saving…"
                  className="min-h-10 rounded-full bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-500"
                >
                  Save new invoice
                </SubmitButton>
              </div>
            </div>
            <div className="pt-5">
              <NewDispatchFields {...liveCreation} />
            </div>
          </form>
        ) : (
          <form
            ref={formRef}
            action={saveDispatch}
            className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 pb-4 dark:border-stone-800">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">Invoice details</p>
                <h2 className="mt-1 text-xl font-semibold">Invoice Details · {sale.sale_no}</h2>
                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                  {broker}
                  {sale.dispatch_date ? ` · invoiced ${sale.dispatch_date}` : ""}
                  {sale.sale_date ? ` · sale ${sale.sale_date}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canEditDetails && !isEditing ? (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
                  >
                    <EditIcon />
                    Edit
                  </button>
                ) : null}
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        formRef.current?.reset();
                        setIsEditing(false);
                      }}
                      className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 dark:border-stone-600 dark:text-stone-200"
                    >
                      Cancel
                    </button>
                    <SubmitButton
                      pendingText="Saving…"
                      className="min-h-10 rounded-full bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-500"
                    >
                      Save changes
                    </SubmitButton>
                  </>
                ) : null}
              </div>
            </div>

            {grnOpen && canProceedToGrn ? (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
                <label className="block text-xs font-semibold text-blue-900 dark:text-blue-200">GRN image or PDF</label>
                <input type="file" name="grn_file" accept="image/*,application/pdf" className="mt-2 block w-full text-xs text-stone-600 dark:text-stone-300" />
                <p className="mt-2 text-xs text-blue-800 dark:text-blue-300">Upload the physical GRN now, or continue without one.</p>
                <SubmitButton formAction={completeGrn.bind(null, sale.id)} pendingText="Proceeding…" className="mt-3 min-h-9 rounded-md bg-blue-700 px-3 text-xs font-semibold text-white">
                  Save GRN and proceed
                </SubmitButton>
              </div>
            ) : null}

            <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
              <DetailRow label="Broker" value={broker} />
              <DetailRow label="Broker invoice" value={sale.sale_no ?? "—"} />
              <DetailRow label="Created date" value={sale.created_date ?? "—"} />
              <DetailRow label="Bundle dispatch" value={sale.bundle_dispatch_no ?? "—"} />
              <DetailRow label="Dispatch date" value={sale.dispatch_date ?? "—"} />
              <SellingMarkField marks={marks} defaultValue={sale.selling_mark_id ?? ""} displayValue={sale.selling_mark ?? "—"} disabled={!isEditing} />
              <CompactField label="Lorry no." name="broker_lorry_no" defaultValue={sale.broker_lorry_no ?? ""} disabled={!isEditing} />
              <CompactField label="Driver" name="driver_name" defaultValue={sale.driver_name ?? ""} disabled={!isEditing} />
              <CompactField label="Sale no." name="target_sale_no" defaultValue={sale.target_sale_no ?? ""} format="sale-no" disabled={!isEditing} />
              <CompactField label="Sale date" name="sale_date" type="date" defaultValue={sale.sale_date ?? ""} disabled={!isEditing} />
              <DetailRow label="Issues" value={`${issueLots} lots`} />
              <DetailRow label="Re-print" value={`${reprintLots} lots`} />
              <DetailRow label="Min kg rules" value={appliedThresholdGrades.size > 0 ? `${appliedThresholdGrades.size} applied` : "Not applied"} />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4 dark:border-stone-800">
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Lot invoices are managed in the list directly below.
              </p>
              <div className="flex gap-2">
                {isEditing && canDelete ? <DeleteDispatchButton saleId={sale.id} /> : null}
              </div>
            </div>
          </form>
        )}

        {creatingInvoice ? (
          <section className="rounded-xl border border-dashed border-stone-300 bg-stone-50/70 px-5 py-10 text-center dark:border-stone-700 dark:bg-stone-900/60">
            <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">Lot invoices</h3>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Save the broker invoice before adding its lot rows.</p>
          </section>
        ) : (
          <LotsSection
            rows={rows}
            saleId={sale.id}
            isOwner={isOwner}
            grades={grades}
            canEdit={canAddLots}
            canAdd={canAddLots}
            soldLotIds={soldLotIds}
            title="Lot invoices"
            onRowsChange={handleRowsChange}
          />
        )}
      </div>
    </div>
  );
}

function InvoiceWorkspaceHeader({
  creatingInvoice,
  currentIndex,
  stats,
  confirmed,
  isConfirming,
  canConfirm,
  canProceedToGrn,
  onCreate,
  onConfirm,
  onOpenGrn,
}: {
  creatingInvoice: boolean;
  currentIndex: number;
  stats: DispatchStats;
  confirmed: boolean;
  isConfirming: boolean;
  canConfirm: boolean;
  canProceedToGrn: boolean;
  onCreate: () => void;
  onConfirm: () => void;
  onOpenGrn: () => void;
}) {
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-stone-700 dark:bg-stone-900 xl:col-start-2 xl:row-start-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          popoverTarget={INVOICE_SEARCH_PANEL_ID}
          popoverTargetAction="toggle"
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-green-50 hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600/30 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-green-950 dark:hover:text-green-300"
        >
          <SearchIcon />
          Search
        </button>
        <button
          type="button"
          aria-label="New invoice"
          title={creatingInvoice ? "A new invoice is already open" : "New invoice"}
          onClick={onCreate}
          disabled={creatingInvoice}
          className="inline-grid min-h-10 min-w-10 place-items-center rounded-full bg-green-700 px-3 text-xl font-semibold leading-none text-white transition hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600/30 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-green-600 dark:hover:bg-green-500"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>

      <StateCommandMenu
        creatingInvoice={creatingInvoice}
        isConfirming={isConfirming}
        canConfirm={canConfirm}
        canProceedToGrn={canProceedToGrn}
        onConfirm={onConfirm}
        onOpenGrn={onOpenGrn}
      />

      <DispatchStateIndicator currentIndex={currentIndex} stats={stats} confirmed={confirmed} />
    </header>
  );
}

function StateCommandMenu({
  creatingInvoice,
  isConfirming,
  canConfirm,
  canProceedToGrn,
  onConfirm,
  onOpenGrn,
}: {
  creatingInvoice: boolean;
  isConfirming: boolean;
  canConfirm: boolean;
  canProceedToGrn: boolean;
  onConfirm: () => void;
  onOpenGrn: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        popoverTarget={INVOICE_STATE_COMMANDS_ID}
        popoverTargetAction="toggle"
        className="inline-flex min-h-10 min-w-32 items-center justify-center gap-2 rounded-full border border-stone-300 bg-stone-100 px-5 text-sm font-semibold text-stone-800 transition hover:border-green-500 hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600/30 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-green-950"
      >
        State
        <ChevronDownIcon />
      </button>
      <div
        id={INVOICE_STATE_COMMANDS_ID}
        popover="auto"
        aria-label="State commands"
        className="fixed left-1/2 top-24 z-[90] m-0 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-stone-200 bg-white p-2 shadow-2xl backdrop:bg-stone-950/25 dark:border-stone-700 dark:bg-stone-950"
      >
        <div className="border-b border-stone-100 px-3 py-2 dark:border-stone-800">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">State</h3>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
            {creatingInvoice ? "Save the new invoice before changing its state." : "Choose the next allowed invoice command."}
          </p>
        </div>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm || isConfirming}
          popoverTarget={INVOICE_STATE_COMMANDS_ID}
          popoverTargetAction="hide"
          className="mt-1 flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-green-950"
        >
          <span>
            <span className="block text-sm font-semibold text-stone-800 dark:text-stone-100">
              {isConfirming ? "Confirming broker invoice…" : "Confirm broker invoice"}
            </span>
            <span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-400">Draft → Invoiced</span>
          </span>
          <span aria-hidden="true" className="text-stone-400">→</span>
        </button>
        <button
          type="button"
          onClick={onOpenGrn}
          disabled={!canProceedToGrn}
          popoverTarget={INVOICE_STATE_COMMANDS_ID}
          popoverTargetAction="hide"
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-blue-950"
        >
          <span>
            <span className="block text-sm font-semibold text-stone-800 dark:text-stone-100">Record GRN</span>
            <span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-400">Invoiced → GRN</span>
          </span>
          <span aria-hidden="true" className="text-stone-400">→</span>
        </button>
      </div>
    </div>
  );
}

function DispatchStateIndicator({
  currentIndex,
  stats,
  confirmed,
}: {
  currentIndex: number;
  stats: DispatchStats;
  confirmed: boolean;
}) {
  const currentStep = DISPATCH_STEPS[currentIndex] ?? DISPATCH_STEPS[0]!;
  const progress = ((currentIndex + 1) / DISPATCH_STEPS.length) * 100;

  return (
    <div className="group relative z-30 min-w-[13rem]">
      <button
        type="button"
        data-testid="invoice-state-indicator"
        className="w-full min-h-10 rounded-xl border border-stone-300 bg-white px-3 py-2 text-left shadow-sm transition hover:border-green-500 focus-visible:border-green-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600/30 dark:border-stone-600 dark:bg-stone-900"
      >
        <span className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
              {confirmed ? "Confirmed state" : "Current state"}
            </span>
            <span className="mt-0.5 block text-sm font-semibold text-stone-900 dark:text-stone-100">
              {currentStep.label} · {currentStep.metric(stats)}
            </span>
          </span>
        </span>
        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
          <span className="block h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
        </span>
      </button>

      <div
        aria-label="Invoice state sequence"
        className="invisible absolute right-0 top-[calc(100%+0.5rem)] w-[18rem] translate-y-1 rounded-xl border border-stone-200 bg-white p-2 opacity-0 shadow-2xl transition duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 dark:border-stone-700 dark:bg-stone-950"
      >
        {DISPATCH_STEPS.map((step, index) => {
          const current = index === currentIndex;
          const completed = index < currentIndex;
          return (
            <div
              key={step.key}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                current
                  ? "bg-green-50 text-green-950 dark:bg-green-950 dark:text-green-100"
                  : "text-stone-700 dark:text-stone-200"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${
                    current || completed ? "bg-green-500" : "bg-stone-300 dark:bg-stone-700"
                  }`} />
                  <span className="text-sm font-semibold">{step.label}</span>
                </div>
                <p className="ml-4 mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">{step.metric(stats)}</p>
              </div>
              {current ? <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">Current</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DispatchSideList({
  rows,
  currentId,
  currentDisplayStatus,
  onSelect,
  onCreate,
}: {
  rows: DispatchListItem[];
  currentId: string;
  currentDisplayStatus: string | null;
  onSelect: () => void;
  onCreate: () => void;
}) {
  return (
    <EntityList
      resource={{ key: "auction.dispatches" }}
      initialRows={rows}
      definition={DISPATCH_LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `Broker invoice ${row.sale_no ?? "unknown"}`}
      create={{
        action: createDispatchWithId,
        disabledReason: "Finish creating the current broker invoice first.",
        onOpen: onCreate,
      }}
      chrome="records-only"
      searchPanelId={INVOICE_SEARCH_PANEL_ID}
      className="xl:sticky xl:top-0 xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:h-[calc(100dvh-8rem)] xl:min-h-[34rem] xl:flex-col"
      listControls={{
        initialFilters: { status: "Draft" },
        storageKey: "auction.invoice-overview.filters",
      }}
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
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="tabular-nums text-stone-500 dark:text-stone-400">Sale {formatSaleNo(dispatch.target_sale_no) || "—"}</span>
                <span className={`rounded-full px-2 py-0.5 ${bucket.style}`}>{bucket.label}</span>
              </div>
            </>
          );
        },
      }}
    />
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <circle cx="8.5" cy="8.5" r="4.75" />
      <path strokeLinecap="round" d="m12 12 4.25 4.25" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 8 4 4 4-4" />
    </svg>
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
  if (disabled) return <DetailRow label={label} value={defaultValue || "—"} />;
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
  marks,
  defaultValue,
  displayValue,
  disabled,
}: {
  marks: MarkOption[];
  defaultValue: string;
  displayValue: string;
  disabled: boolean;
}) {
  if (disabled) return <DetailRow label="Selling mark" value={displayValue} />;
  return (
    <div className="grid min-w-0 gap-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">Selling mark</label>
      <select name="selling_mark_id" required defaultValue={defaultValue} className="h-9 min-w-0 w-full rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100">
        <option value="" disabled>Select selling mark</option>
        {marks.map((mark) => <option key={mark.id} value={mark.id}>{mark.code}{mark.name ? ` — ${mark.name}` : ""}</option>)}
      </select>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</span>
      <span className="truncate text-sm font-medium leading-5 text-stone-800 dark:text-stone-200" title={value}>
        {value}
      </span>
    </div>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
    </svg>
  );
}
