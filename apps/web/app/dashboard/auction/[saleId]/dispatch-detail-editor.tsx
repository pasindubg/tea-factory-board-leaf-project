"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ListSearchPanel, ListSidePanel, SortButton, useListControls, type ColumnDef } from "@/components/list-controls";
import { confirmDispatchDraft, updateSale } from "../actions";
import { stateBucket } from "../state-buckets";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";
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
type GradeOption = { code: string; name: string };
type DispatchListItem = {
  id: string;
  sale_no: string | null;
  target_sale_no: string | null;
  broker: string;
  dispatch_date: string | null;
  sale_date: string | null;
  status: string | null;
};
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
  { key: "grn", label: "GRN", metric: () => "Store notice" },
  { key: "catalogued", label: "Catalogued", metric: (stats) => `${stats.cataloguedLots}/${stats.totalLots} lots` },
];

const DISPATCH_LIST_COLUMNS: ColumnDef<DispatchListItem>[] = [
  { key: "sale_no", label: "Dispatch", accessor: (row) => row.sale_no ?? null, sortable: true, filter: "text" },
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select" },
  { key: "target_sale_no", label: "Sale", accessor: (row) => row.target_sale_no ?? null, sortable: true, filter: "text" },
  { key: "dispatch_date", label: "Dispatched", accessor: (row) => row.dispatch_date ?? null, sortable: true, searchInput: "date" },
  { key: "sale_date", label: "Sale date", accessor: (row) => row.sale_date ?? null, sortable: true, searchInput: "date" },
  { key: "status", label: "Status", accessor: (row) => stateBucket(cappedDispatchStatus(row.status)).label, sortable: true, filter: "select" },
];

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

function effectiveDispatchStatus(status: string | null, stats: DispatchStats) {
  if (stats.cataloguedLots > 0) return "catalogued";
  if (status === "grn") return "grn";
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
  addAction,
  soldLotIds,
}: {
  sale: SaleDetail;
  dispatches: DispatchListItem[];
  broker: string;
  rows: LotRow[];
  marks: MarkOption[];
  grades: GradeOption[];
  isOwner: boolean;
  addAction: (formData: FormData) => Promise<string | null>;
  soldLotIds: string[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const canDelete = isOwner && (sale.status === "dispatched" || sale.status === "draft");
  const canEditDetails = isOwner;
  const isDraftStatus = sale.status === "draft" || sale.status === "dispatched";
  const canConfirmDraft = !isEditing && isDraftStatus;
  const canAddLots = isOwner || isDraftStatus;
  const cataloguedLots = rows.filter((row) => ["acknowledged", "pending", "missing", "shutout", "withdrawn", "re-print", "valued", "sold", "settled"].includes(row.state ?? "") || soldLotIds.includes(row.id)).length;
  const issueLots = rows.filter((row) => ["pending", "missing", "shutout", "withdrawn"].includes(row.state ?? "")).length;
  const reprintLots = rows.filter((row) => row.state === "re-print").length;
  const appliedThresholdGrades = new Set(rows.filter((row) => row.threshold_applies).map((row) => row.grade).filter(Boolean));
  const dispatchStats: DispatchStats = {
    totalLots: rows.length,
    cataloguedLots,
    issueLots,
    reprintLots,
  };
  const displayStatus = effectiveDispatchStatus(sale.status, dispatchStats);
  const bucket = stateBucket(displayStatus);
  const currentStatusIndex = statusIndex(displayStatus);
  const detailConfirmed = currentStatusIndex >= statusIndex("grn");

  async function saveDispatch(formData: FormData) {
    await updateSale(sale.id, formData);
    setIsEditing(false);
  }

  async function confirmDraft() {
    setIsConfirming(true);
    try {
      await confirmDispatchDraft(sale.id);
      router.refresh();
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100dvh-8rem)] w-full items-start gap-6 xl:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)] 2xl:grid-cols-[22rem_minmax(0,1fr)]">
      <DispatchSideList
        rows={dispatches}
        currentId={sale.id}
        currentDisplayStatus={displayStatus}
        title="Dispatches"
      />
      <div className="min-w-0 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/auction" className="text-sm text-green-700 dark:text-green-400 hover:underline">
            ← Dispatches Overview
          </Link>
          <h2 className="mt-1 text-xl font-semibold">
            Dispatch {sale.sale_no}
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {broker}
            {sale.dispatch_date ? ` · dispatched ${sale.dispatch_date}` : ""}
            {sale.sale_date ? ` · sale ${sale.sale_date}` : ""}
            {" · "}
            <span className={`rounded-full px-2 py-0.5 text-xs ${bucket.style}`} title={`Actual status: ${sale.status}`}>
              {bucket.label}
            </span>
          </p>
        </div>

        <div className="w-full max-w-md lg:ml-auto lg:w-[26rem]">
          <ol className="grid grid-cols-3 gap-1.5">
            {DISPATCH_STEPS.map((step, index) => {
              const selected = index === currentStatusIndex;
              const stepCard = (
                <div
                  className={`min-h-12 rounded-lg border px-2 py-1.5 text-left transition-colors ${statusStepClass(index, currentStatusIndex, false, selected)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-medium text-current/70">{step.metric(dispatchStats)}</span>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${index <= currentStatusIndex ? "bg-current" : "bg-stone-300 dark:bg-stone-600"}`} />
                  </div>
                  <p className="mt-1 truncate text-[11px] font-semibold">{step.label}</p>
                </div>
              );
              return (
                <li key={step.key}>
                  {stepCard}
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
            grades={grades}
            addAction={addAction}
            canEdit={isEditing}
            canAdd={canAddLots}
            soldLotIds={soldLotIds}
            title="Dispatched lots"
          />
        </div>

        <form ref={formRef} action={saveDispatch}>
          <aside className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900 xl:sticky xl:top-6">
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
              <CompactField label="Sale no." name="target_sale_no" defaultValue={sale.target_sale_no ?? ""} format="sale-no" disabled={!isEditing} />
              <CompactField label="Dispatch date" name="dispatch_date" type="date" defaultValue={sale.dispatch_date ?? ""} disabled={!isEditing} />
              <CompactField label="Sale date" name="sale_date" type="date" defaultValue={sale.sale_date ?? ""} disabled={!isEditing} />
              <DetailRow label="Issues" value={`${issueLots} lots`} />
              <DetailRow label="Re-print" value={`${reprintLots} lots`} />
              <DetailRow label="Min kg rules" value={appliedThresholdGrades.size > 0 ? `${appliedThresholdGrades.size} applied` : "Not applied"} />
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

      </div>
    </div>
  );
}

function DispatchSideList({
  rows,
  currentId,
  currentDisplayStatus,
  title,
}: {
  rows: DispatchListItem[];
  currentId: string;
  currentDisplayStatus: string | null;
  title: string;
}) {
  const controls = useListControls(rows, DISPATCH_LIST_COLUMNS);
  return (
    <ListSidePanel className="xl:sticky xl:top-0 xl:h-[calc(100dvh-8rem)] xl:min-h-[34rem] xl:flex-col">
      <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200">{title}</h3>
          <SortButton col={DISPATCH_LIST_COLUMNS[0]} controls={controls} />
        </div>
      </div>
      <ListSearchPanel columns={DISPATCH_LIST_COLUMNS} controls={controls} label="Search" variant="popover" />
      <div className="max-h-[28rem] overflow-y-auto xl:max-h-none xl:min-h-0 xl:flex-1">
        {controls.rows.map((dispatch) => {
          const active = dispatch.id === currentId;
          const bucket = stateBucket(active ? currentDisplayStatus : cappedDispatchStatus(dispatch.status));
          return (
            <Link
              key={dispatch.id}
              href={`/dashboard/auction/${dispatch.id}`}
              className={`block border-b border-stone-100 px-4 py-3 text-sm last:border-0 dark:border-stone-800 ${
                active
                  ? "bg-green-50 text-green-950 dark:bg-green-950 dark:text-green-100"
                  : "hover:bg-stone-50 dark:hover:bg-stone-800/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold tabular-nums text-green-700 dark:text-green-400">{dispatch.sale_no ?? "—"}</span>
                {active && <span className="text-stone-400">‹</span>}
              </div>
              <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{dispatch.broker}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="tabular-nums text-stone-500 dark:text-stone-400">Sale {dispatch.target_sale_no ?? "—"}</span>
                <span className={`rounded-full px-2 py-0.5 ${bucket.style}`}>{bucket.label}</span>
              </div>
            </Link>
          );
        })}
        {controls.rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500">No dispatches match.</p>
        )}
      </div>
    </ListSidePanel>
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
    <div className="flex items-center justify-between gap-3">
      <label className="shrink-0 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        onBlur={(event) => {
          if (format === "four-digit") event.currentTarget.value = formatFourDigitNo(event.currentTarget.value);
          if (format === "sale-no") event.currentTarget.value = formatSaleNo(event.currentTarget.value);
        }}
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
