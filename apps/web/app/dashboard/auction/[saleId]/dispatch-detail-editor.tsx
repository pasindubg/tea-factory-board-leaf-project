"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { confirmDispatchDraft, ingestAcknowledgement, ingestBankCsv, ingestContract, ingestValuation, updateSale } from "../actions";
import { stateBucket } from "../state-buckets";
import { DeleteDispatchButton } from "./delete-dispatch-button";
import { LotsSection } from "./lots-section";
import type { LotRow } from "./lot-row";

type SaleDetail = {
  id: string;
  sale_no: string | null;
  target_sale_no: string | null;
  dispatch_date: string | null;
  sale_date: string | null;
  prompt_date: string | null;
  status: string | null;
};

type MarkOption = { id: string; code: string; name: string };
type DispatchStats = {
  totalLots: number;
  issueLots: number;
  reprintLots: number;
  valuedLots: number;
  soldLots: number;
  promptDate: string | null;
};
type DispatchStep = {
  key: string;
  label: string;
  metric: (stats: DispatchStats) => string;
};

const DISPATCH_STEPS: DispatchStep[] = [
  { key: "draft", label: "Draft", metric: (stats) => `${stats.totalLots} lots` },
  { key: "grn", label: "GRN", metric: () => "Store notice" },
  { key: "catalogued", label: "Catalogued", metric: (stats) => `${stats.issueLots} issue lots` },
  { key: "valued", label: "Valued", metric: (stats) => `${stats.valuedLots}/${stats.totalLots} lots` },
  { key: "sold", label: "Sold", metric: (stats) => `${stats.soldLots}/${stats.totalLots} lots` },
  { key: "settled", label: "Settled", metric: (stats) => stats.promptDate ?? "Prompt pending" },
  { key: "broker_statement", label: "Broker statement", metric: () => "Pending" },
];

const RECON_UPLOADS = [
  {
    title: "Acknowledgement",
    description: "Catalogue broker lots and flag shutouts against invoiced lots.",
    accept: "application/pdf",
    pendingText: "Reading...",
    action: ingestAcknowledgement,
  },
  {
    title: "Valuation report",
    description: "Record broker valuations before the sellers contract arrives.",
    accept: "application/pdf",
    pendingText: "Reading...",
    action: ingestValuation,
  },
  {
    title: "Sellers contract",
    description: "Confirm sold lots, prices, VAT, guarantee status, and settlement lines.",
    accept: "application/pdf",
    pendingText: "Reading...",
    action: ingestContract,
  },
  {
    title: "Bank statement",
    description: "Import broker credits for settlement reconciliation.",
    accept: ".csv,text/csv",
    pendingText: "Importing...",
    action: ingestBankCsv,
  },
] as const;

function statusIndex(status: string | null) {
  const normalizedStatus = status === "dispatched" ? "draft" : status;
  const index = DISPATCH_STEPS.findIndex((step) => step.key === normalizedStatus);
  return index >= 0 ? index : 0;
}

function statusStepClass(index: number, currentIndex: number, editing: boolean, selected: boolean) {
  if (selected) {
    return "border-green-500 bg-green-50 text-green-900 dark:border-green-600 dark:bg-green-950 dark:text-green-100";
  }
  if (index < currentIndex) {
    return "border-green-300 bg-green-50/70 text-green-900 dark:border-green-800 dark:bg-green-950/70 dark:text-green-200";
  }
  if (index === currentIndex) {
    return "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200";
  }
  return editing
    ? "border-stone-300 bg-white text-stone-600 hover:border-green-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:hover:border-green-700 dark:hover:text-stone-100"
    : "border-stone-200 bg-white text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400";
}

export function DispatchDetailEditor({
  sale,
  broker,
  rows,
  marks,
  isOwner,
  addAction,
  soldLotIds,
}: {
  sale: SaleDetail;
  broker: string;
  rows: LotRow[];
  marks: MarkOption[];
  isOwner: boolean;
  addAction: (formData: FormData) => Promise<string | null>;
  soldLotIds: string[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isReconOpen, setIsReconOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(sale.status ?? "draft");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const bucket = stateBucket(sale.status);
  const canDelete = isOwner && (sale.status === "dispatched" || sale.status === "draft");
  const canEditDetails = isOwner;
  const isDraftStatus = sale.status === "draft" || sale.status === "dispatched";
  const canConfirmDraft = !isEditing && isDraftStatus;
  const canAddLots = isOwner || isDraftStatus;
  const currentStatusIndex = statusIndex(sale.status);
  const selectedStatusIndex = statusIndex(selectedStatus);
  const issueLots = rows.filter((row) => ["pending", "missing", "shutout", "withdrawn"].includes(row.state ?? "")).length;
  const reprintLots = rows.filter((row) => row.state === "re-print").length;
  const valuedLots = rows.filter((row) => ["valued", "sold", "settled"].includes(row.state ?? "") || soldLotIds.includes(row.id)).length;
  const dispatchStats: DispatchStats = {
    totalLots: rows.length,
    issueLots,
    reprintLots,
    valuedLots,
    soldLots: soldLotIds.length,
    promptDate: sale.prompt_date,
  };
  const detailConfirmed = currentStatusIndex >= statusIndex("grn");

  async function saveDispatch(formData: FormData) {
    await updateSale(sale.id, formData);
    setIsEditing(false);
  }

  async function confirmDraft() {
    setIsConfirming(true);
    try {
      await confirmDispatchDraft(sale.id);
      setSelectedStatus("grn");
      router.refresh();
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/auction" className="text-sm text-green-700 dark:text-green-400 hover:underline">
            ← Dispatches Overview
          </Link>
          <h2 className="mt-1 text-xl font-semibold">Dispatch {sale.sale_no}</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {broker}
            {sale.dispatch_date ? ` · dispatched ${sale.dispatch_date}` : ""}
            {sale.sale_date ? ` · sale ${sale.sale_date}` : ""}
            {sale.prompt_date ? ` · prompt ${sale.prompt_date}` : ""}
            {" · "}
            <span className={`rounded-full px-2 py-0.5 text-xs ${bucket.style}`} title={`Actual status: ${sale.status}`}>
              {bucket.label}
            </span>
          </p>
        </div>

        <div className="w-full max-w-5xl">
          <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-7">
            {DISPATCH_STEPS.map((step, index) => {
              const selected = isEditing ? index === selectedStatusIndex : index === currentStatusIndex;
              const stepCard = (
                <div
                  className={`min-h-16 rounded-lg border px-2.5 py-2 text-left transition-colors ${statusStepClass(index, currentStatusIndex, isEditing, selected)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-current/70">{step.metric(dispatchStats)}</span>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${index <= (isEditing ? selectedStatusIndex : currentStatusIndex) ? "bg-current" : "bg-stone-300 dark:bg-stone-600"}`} />
                  </div>
                  <p className="mt-2 truncate text-xs font-semibold">{step.label}</p>
                </div>
              );
              return (
                <li key={step.key}>
                  {isEditing ? (
                    <button type="button" onClick={() => setSelectedStatus(step.key)} className="block w-full">
                      {stepCard}
                    </button>
                  ) : stepCard}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <LotsSection
            rows={rows}
            saleId={sale.id}
            isOwner={isOwner}
            marks={marks}
            addAction={addAction}
            canEdit={isEditing}
            canAdd={canAddLots}
            soldLotIds={soldLotIds}
          />
        </div>

        <form ref={formRef} action={saveDispatch}>
          <aside className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900 xl:sticky xl:top-6">
            <input type="hidden" name="status" value={selectedStatus} />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Dispatch details</h3>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${detailConfirmed ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
                    {detailConfirmed ? "Confirmed" : "Unconfirmed"}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${bucket.style}`}>{bucket.label}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsReconOpen(true)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                  title="Reconciliations"
                >
                  <DocumentIcon />
                </button>
                {canEditDetails && !isEditing && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                    title="Edit details"
                  >
                    <EditIcon />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <DetailRow label="Broker" value={broker} />
              <DetailRow label="Dispatch" value={sale.sale_no ?? "—"} />
              <CompactField label="Sale no." name="target_sale_no" defaultValue={sale.target_sale_no ?? ""} disabled={!isEditing} />
              <CompactField label="Dispatch date" name="dispatch_date" type="date" defaultValue={sale.dispatch_date ?? ""} disabled={!isEditing} />
              <CompactField label="Sale date" name="sale_date" type="date" defaultValue={sale.sale_date ?? ""} disabled={!isEditing} />
              <CompactField label="Prompt" name="prompt_date" type="date" defaultValue={sale.prompt_date ?? ""} disabled={!isEditing} />
              <DetailRow label="Issues" value={`${issueLots} lots`} />
              <DetailRow label="Re-print" value={`${reprintLots} lots`} />
              <DetailRow label="Min kg rule" value="Default 220 kg" />
            </div>

            {canConfirmDraft && (
              <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">
                <button
                  type="button"
                  onClick={confirmDraft}
                  disabled={isConfirming}
                  className="inline-flex h-9 w-full items-center justify-center rounded-md bg-green-700 px-3 text-xs font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-green-600 dark:hover:bg-green-700"
                >
                  {isConfirming ? "Confirming..." : "Confirm draft"}
                </button>
              </div>
            )}

            {isEditing && (
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-4 dark:border-stone-800">
                {canDelete && <DeleteDispatchButton saleId={sale.id} />}
                <button
                  type="button"
                  onClick={() => {
                    formRef.current?.reset();
                    setSelectedStatus(sale.status ?? "draft");
                    setIsEditing(false);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 text-xs font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  <span aria-hidden="true">×</span>
                  Cancel
                </button>
                <SubmitButton
                  pendingText="Saving..."
                  className="inline-flex h-8 items-center justify-center rounded-md bg-green-700 px-3 text-xs font-semibold text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700"
                >
                  Save
                </SubmitButton>
              </div>
            )}
          </aside>
        </form>
      </div>

      {isReconOpen && (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-labelledby="recon-drawer-title">
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="hidden flex-1 cursor-default sm:block"
            onClick={() => setIsReconOpen(false)}
          />
          <aside className="flex h-full w-full max-w-2xl flex-col border-l border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-950">
            <div className="border-b border-stone-200 px-5 py-4 dark:border-stone-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="recon-drawer-title" className="text-base font-semibold text-stone-900 dark:text-stone-100">
                    Dispatch reconciliations
                  </h3>
                  <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                    Dispatch {sale.sale_no} · sale {sale.target_sale_no ?? "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReconOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                  aria-label="Close reconciliations"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="space-y-2">
                {RECON_UPLOADS.map((upload) => (
                  <ReconciliationUpload
                    key={upload.title}
                    saleId={sale.id}
                    title={upload.title}
                    description={upload.description}
                    accept={upload.accept}
                    pendingText={upload.pendingText}
                    action={upload.action}
                  />
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function ReconciliationUpload({
  saleId,
  title,
  description,
  accept,
  pendingText,
  action,
}: {
  saleId: string;
  title: string;
  description: string;
  accept: string;
  pendingText: string;
  action: (saleId: string, formData: FormData) => Promise<void>;
}) {
  const inputId = `file-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
      <form action={action.bind(null, saleId)} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-stone-800 dark:text-stone-100">{title}</h4>
          <p className="mt-0.5 text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <input id={inputId} type="file" name="file" accept={accept} required className="peer sr-only" />
          <label
            htmlFor={inputId}
            className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md bg-blue-700 px-3 text-xs font-semibold text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            Choose file
          </label>
          <SubmitButton
            pendingText={pendingText}
            className="inline-flex h-8 items-center justify-center rounded-md bg-green-700 px-3 text-xs font-semibold text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700"
          >
            Upload
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

function CompactField({
  label,
  name,
  defaultValue,
  type = "text",
  disabled = false,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  disabled?: boolean;
}) {
  if (disabled) return <DetailRow label={label} value={defaultValue || "—"} />;
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="shrink-0 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="h-8 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2 text-right text-sm text-stone-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/20 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</span>
      <span className="truncate text-sm font-medium text-stone-800 dark:text-stone-200" title={value}>
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

function DocumentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v11A2.5 2.5 0 0 0 4.5 18h11a2.5 2.5 0 0 0 2.5-2.5V7.621a2.5 2.5 0 0 0-.732-1.767l-3.122-3.122A2.5 2.5 0 0 0 12.379 2H4.5Zm7.75 1.5v2.75c0 .828.672 1.5 1.5 1.5h2.75v7.75a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1h7.75Zm1.5 1.06 1.69 1.69h-1.69V4.56ZM6 10.25A.75.75 0 0 1 6.75 9.5h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 10.25Zm0 3A.75.75 0 0 1 6.75 12.5h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 13.25Z" clipRule="evenodd" />
    </svg>
  );
}
