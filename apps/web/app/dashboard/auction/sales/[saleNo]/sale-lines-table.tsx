"use client";

import Link from "next/link";
import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { updateSaleLotsInline } from "../../actions";
import { money } from "../../format";
import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";

export type SaleLineRow = {
  id: string;
  saleId: string;
  dispatchId: string | null;
  dispatchSaleNo: string | null;
  lotNo: string | null;
  invoiceNo: string;
  grade: string | null;
  state: string | null;
  stateLabel: string;
  stateStyle: string;
  buyerName: string | null;
  buyerVatNo: string | null;
  bags: number | null;
  kgPerBag: number | null;
  sampleKg: number | null;
  netWt: number;
  pricePerKg: number | null;
  proceeds: number | null;
  vatAmount: number | null;
  onGuarantee: boolean | null;
  reprint: boolean;
  reprintCount: number;
};

const COLUMNS: ColumnDef<SaleLineRow>[] = [
  { key: "dispatchSaleNo", label: "Dispatch no.", accessor: (r) => r.dispatchSaleNo ?? null, sortable: true, filter: "text", lov: false },
  { key: "lotNo", label: "Lot no.", accessor: (r) => r.lotNo ?? null, sortable: true, filter: "text", lov: false },
  { key: "invoiceNo", label: "Invoice(s)", accessor: (r) => r.invoiceNo, sortable: true, filter: "text", lov: false },
  { key: "grade", label: "Grade", accessor: (r) => r.grade ?? null, sortable: true, filter: "select" },
  { key: "stateLabel", label: "Status", accessor: (r) => r.stateLabel, sortable: true, filter: "select" },
  { key: "buyerName", label: "Buyer", accessor: (r) => r.buyerName ?? null, sortable: true, filter: "select" },
  { key: "bags", label: "Bags", accessor: (r) => r.bags ?? null, sortable: true, lov: false, searchInput: "number" },
  { key: "kgPerBag", label: "kg/bag", accessor: (r) => r.kgPerBag ?? null, sortable: true, lov: false, searchInput: "number" },
  { key: "sampleKg", label: "Total sample kg", accessor: (r) => r.sampleKg ?? null, sortable: true, lov: false, searchInput: "number" },
  { key: "netWt", label: "Net kg", accessor: (r) => r.netWt, sortable: true, lov: false, searchInput: "number" },
  { key: "pricePerKg", label: "Price/kg", accessor: (r) => r.pricePerKg ?? null, sortable: true, lov: false, searchInput: "number" },
  { key: "proceeds", label: "Proceeds", accessor: (r) => r.proceeds ?? null, sortable: true, lov: false, searchInput: "number" },
  { key: "vatAmount", label: "VAT", accessor: (r) => r.vatAmount ?? null, sortable: true, lov: false, searchInput: "number" },
  { key: "onGuarantee", label: "Guarantee", accessor: (r) => (r.onGuarantee == null ? "-" : r.onGuarantee ? "Guarantee" : "Cash"), sortable: true, filter: "select", filterOptions: [{ value: "Guarantee", label: "Guarantee" }, { value: "Cash", label: "Cash" }, { value: "-", label: "Not sold" }] },
  { key: "reprint", label: "Re-print", accessor: (r) => (r.reprint ? "Yes" : "No"), sortable: true, filter: "select", filterOptions: [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }] },
  { key: "reprintCount", label: "Re-print count", accessor: (r) => r.reprintCount, sortable: true, lov: false, searchInput: "number" },
];

const RIGHT_ALIGNED = new Set(["bags", "kgPerBag", "sampleKg", "netWt", "pricePerKg", "proceeds", "vatAmount", "reprintCount"]);
const EDITABLE_STATES = ["acknowledged", "pending", "missing", "shutout", "valued", "withdrawn", "re-print", "sold", "settled"];
const SOLD_REQUIREMENTS = "It is not allowed to change the status to sold without entering Price/kg, proceeds value and VAT.";

export function SaleLinesTable({ rows, invoiceEditingLocked = false }: { rows: SaleLineRow[]; invoiceEditingLocked?: boolean }) {
  const router = useRouter();
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const selectedRows = useMemo(() => rows.filter((row) => selectedIds.has(row.id)), [rows, selectedIds]);
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedIds.has(row.id));
  const actionSaleId = selectedRows[0]?.saleId ?? rows[0]?.saleId ?? "";
  const formId = "sale-lines-inline-edit";

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 4500);
  }

  function toggleSelected(id: string) {
    if (invoiceEditingLocked) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    if (invoiceEditingLocked) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const row of visibleRows) next.delete(row.id);
      } else {
        for (const row of visibleRows) next.add(row.id);
      }
      return next;
    });
  }

  function handleRowSelection(event: MouseEvent<HTMLTableRowElement>, id: string) {
    if ((event.target as HTMLElement).closest("a,button,input,select,textarea")) return;
    toggleSelected(id);
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleSelected(id);
  }

  function validateSoldRows(formData: FormData) {
    const states = formData.getAll("state").map((value) => String(value ?? ""));
    const prices = formData.getAll("price_per_kg").map((value) => String(value ?? ""));
    const proceeds = formData.getAll("proceeds").map((value) => String(value ?? ""));
    const vats = formData.getAll("vat_amount").map((value) => String(value ?? ""));
    return states.every((state, index) => {
      if (state !== "sold") return true;
      return Number(prices[index]) > 0 && Number(proceeds[index]) > 0 && vats[index] !== "" && !Number.isNaN(Number(vats[index]));
    });
  }

  return (
    <form
      id={formId}
      action={async (formData) => {
        if (!validateSoldRows(formData)) {
          showToast(SOLD_REQUIREMENTS);
          return;
        }
        setSaving(true);
        try {
          await updateSaleLotsInline(actionSaleId, formData);
          setEditing(false);
          setSelectedIds(new Set());
          router.refresh();
        } finally {
          setSaving(false);
        }
      }}
      className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900"
    >
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/70 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/60">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          {invoiceEditingLocked ? `${rows.length} lots · settled` : editing ? `${selectedIds.size} editing` : selectedIds.size > 0 ? `${selectedIds.size} selected` : `${rows.length} lots`}
        </p>
        {editing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || selectedIds.size === 0}
              className="inline-flex h-8 items-center gap-2 rounded-md bg-green-700 px-3 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              <span className={`h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent ${saving ? "" : "hidden"}`} />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={selectedIds.size === 0 || invoiceEditingLocked}
            onClick={() => setEditing(true)}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            title={invoiceEditingLocked ? "Invoice editing is locked after settlement." : "Edit selected lots"}
          >
            <PencilIcon />
            Edit
          </button>
        )}
      </div>
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleVisible}
                  disabled={invoiceEditingLocked}
                  aria-label="Select visible lots"
                />
              </th>
              {COLUMNS.map((col) => (
                <th key={col.key} className={`px-4 py-3 ${RIGHT_ALIGNED.has(col.key) ? "text-right" : ""}`}>
                  {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((line) => {
              const isEditing = editing && selectedIds.has(line.id);
              return (
                <tr
                  key={line.id}
                  tabIndex={invoiceEditingLocked ? -1 : 0}
                  aria-selected={selectedIds.has(line.id)}
                  onClick={(event) => handleRowSelection(event, line.id)}
                  onKeyDown={(event) => handleRowKeyDown(event, line.id)}
                  className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selectedIds.has(line.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(line.id)}
                      onChange={() => toggleSelected(line.id)}
                      disabled={invoiceEditingLocked}
                      aria-label={`Select invoice ${line.invoiceNo || line.id}`}
                    />
                    {isEditing && <input type="hidden" name="lot_id" value={line.id} />}
                  </td>
                  <td className="px-4 py-2">
                    {line.dispatchId ? (
                      <Link href={`/dashboard/auction/${line.dispatchId}`} className="text-green-700 hover:underline dark:text-green-400">
                        {line.dispatchSaleNo}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? <TextInput name="lot_no" defaultValue={line.lotNo ?? ""} width="w-20" /> : line.lotNo ?? "—"}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    {isEditing ? <TextInput name="invoice_no" defaultValue={line.invoiceNo} width="w-28" /> : line.invoiceNo || "—"}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? <TextInput name="grade" defaultValue={line.grade ?? ""} width="w-24" /> : line.grade ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <select
                        name="state"
                        defaultValue={line.state ?? "acknowledged"}
                        className="w-32 rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                      >
                        {EDITABLE_STATES.map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${line.stateStyle}`}>{line.stateLabel}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? <TextInput name="buyer_name" defaultValue={line.buyerName ?? ""} width="w-36" /> : (
                      <>
                        {line.buyerName ?? "—"}
                        {line.buyerVatNo && <span className="ml-1 text-xs text-stone-400 dark:text-stone-500">{line.buyerVatNo}</span>}
                      </>
                    )}
                    {isEditing && <input type="hidden" name="buyer_vat_no" defaultValue={line.buyerVatNo ?? ""} />}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {isEditing ? <NumberInput name="bags" defaultValue={line.bags} width="w-20" step="1" /> : line.bags ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {isEditing ? <NumberInput name="kg_per_bag" defaultValue={line.kgPerBag} width="w-20" /> : line.kgPerBag != null ? line.kgPerBag.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {isEditing ? <NumberInput name="sample_allowance" defaultValue={line.sampleKg} width="w-20" /> : line.sampleKg != null ? line.sampleKg.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{line.netWt.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {isEditing ? <NumberInput name="price_per_kg" defaultValue={line.pricePerKg} width="w-24" /> : line.pricePerKg != null ? line.pricePerKg.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {isEditing ? <NumberInput name="proceeds" defaultValue={line.proceeds} width="w-24" /> : line.proceeds != null ? money(line.proceeds) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {isEditing ? <NumberInput name="vat_amount" defaultValue={line.vatAmount} width="w-24" /> : line.vatAmount != null ? money(line.vatAmount) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <select
                        name="on_guarantee"
                        defaultValue={line.onGuarantee == null ? "" : line.onGuarantee ? "true" : "false"}
                        className="w-28 rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                      >
                        <option value="">Not sold</option>
                        <option value="false">Cash</option>
                        <option value="true">Guarantee</option>
                      </select>
                    ) : line.onGuarantee == null ? (
                      <span className="text-stone-400 dark:text-stone-500">—</span>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${line.onGuarantee ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-400" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
                        {line.onGuarantee ? "Guarantee" : "Cash"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{line.reprint ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{line.reprintCount}</td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && rows.length > 0 && (
              <tr>
                <td colSpan={17} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                  No lots match these filters.
                </td>
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={17} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                  No lots have been recorded for this sale yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {toast && (
        <div className="fixed bottom-5 left-5 z-[60] max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg dark:border-red-900 dark:bg-red-950 dark:text-red-300" role="alert">
          {toast}
        </div>
      )}
    </form>
  );
}

function TextInput({ name, defaultValue, width }: { name: string; defaultValue: string; width: string }) {
  return (
    <input
      name={name}
      defaultValue={defaultValue}
      className={`${width} rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100`}
    />
  );
}

function NumberInput({ name, defaultValue, width, step = "0.01" }: { name: string; defaultValue: number | null; width: string; step?: string }) {
  return (
    <input
      name={name}
      type="number"
      min="0"
      step={step}
      defaultValue={defaultValue ?? ""}
      className={`${width} rounded border border-stone-300 bg-white px-2 py-1 text-right text-xs text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100`}
    />
  );
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
    </svg>
  );
}
