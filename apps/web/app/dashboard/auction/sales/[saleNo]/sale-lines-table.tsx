"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { updateSaleLotsInline } from "../../actions";
import { deleteLot } from "../../_actions/lots";
import { money } from "../../format";
import { ListCommandToolbar, ListSearchPanel, ListSelectionCell, ListSelectionHeader, ListSurface, SortButton, useListControls, useListSelection, type ColumnDef, type ListDefinition } from "@/components/list-controls";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { showAppToast } from "@/components/action-feedback";

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
  { key: "dispatchSaleNo", label: "Broker invoice no.", accessor: (r) => r.dispatchSaleNo ?? null, sortable: true, filter: "text", lov: false },
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
const EDITABLE_STATES = ["acknowledged", "pending", "missing", "shutout", "not-valued", "valued", "withdrawn", "re-print", "sold", "settled"];
const SOLD_REQUIREMENTS = "It is not allowed to change the status to sold without entering Price/kg, proceeds value and VAT.";

const LIST: ListDefinition<SaleLineRow> = {
  columns: COLUMNS,
  selectionMode: "multi",
  enableEdit: true,
  enableDelete: true,
};

export function SaleLinesTable({ rows, invoiceEditingLocked = false }: { rows: SaleLineRow[]; invoiceEditingLocked?: boolean }) {
  const router = useRouter();
  const controls = useListControls(rows, LIST.columns);
  const visibleRows = controls.rows;
  const selection = useListSelection(rows, { mode: LIST.selectionMode ?? "multi", getId: (row) => row.id });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<SaleLineRow[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const selectedRows = useMemo(() => rows.filter((row) => selection.selectedIds.has(row.id)), [rows, selection.selectedIds]);
  const actionSaleId = selectedRows[0]?.saleId ?? rows[0]?.saleId ?? "";
  const formId = "sale-lines-inline-edit";

  async function confirmDelete() {
    if (!deleteRequest) return;
    setDeleting(true);
    try {
      for (const row of deleteRequest) {
        if (!row.dispatchId) throw new Error("This lot is not linked to a broker invoice.");
        await deleteLot(row.id, row.dispatchId);
      }
      selection.clear();
      setDeleteRequest(null);
      showAppToast(`${deleteRequest.length === 1 ? "Lot" : "Lots"} deleted.`);
      router.refresh();
    } catch {
      showAppToast("Could not delete one or more lots. Please try again.", "error");
    } finally {
      setDeleting(false);
    }
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
          showAppToast(SOLD_REQUIREMENTS, "error");
          return;
        }
        setSaving(true);
        try {
          await updateSaleLotsInline(actionSaleId, formData);
          setEditing(false);
          selection.clear();
          router.refresh();
        } finally {
          setSaving(false);
        }
      }}
      className="mt-3"
    >
      <ListSurface>
      <ListCommandToolbar
        mode={LIST.selectionMode ?? "multi"}
        count={selection.selectedCount}
        enableEdit={Boolean(LIST.enableEdit && !editing && !invoiceEditingLocked)}
        onEdit={{ label: "Edit", onClick: () => setEditing(true), disabled: selection.selectedCount === 0 }}
        enableDelete={Boolean(LIST.enableDelete && !editing && !invoiceEditingLocked)}
        onDelete={{ label: "Delete", onClick: () => setDeleteRequest(selectedRows), disabled: selection.selectedCount === 0, busy: deleting }}
      >
        {editing && (
          <>
            <button
              type="button"
              onClick={() => { setEditing(false); selection.clear(); }}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || selection.selectedCount === 0}
              className="inline-flex h-8 items-center gap-2 rounded-md bg-green-700 px-3 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              <span className={`h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent ${saving ? "" : "hidden"}`} />
              {saving ? "Saving..." : "Save"}
            </button>
          </>
        )}
      </ListCommandToolbar>
      <ListSearchPanel columns={LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              <ListSelectionHeader mode={LIST.selectionMode ?? "multi"} scope="sale-lots" checked={selection.allVisibleSelected(visibleRows)} onChange={() => selection.toggleVisible(visibleRows)} disabled={invoiceEditingLocked || editing} />
              {LIST.columns.map((col) => (
                <th key={col.key} className={`px-4 py-3 ${RIGHT_ALIGNED.has(col.key) ? "text-right" : ""}`}>
                  {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((line) => {
              const isEditing = editing && selection.isSelected(line.id);
              return (
                <tr
                  key={line.id}
                  {...selection.rowProps(line.id, invoiceEditingLocked || editing)}
                  className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(line.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
                >
                  <ListSelectionCell mode={LIST.selectionMode ?? "multi"} scope="sale-lots" id={line.id} label={`invoice ${line.invoiceNo || line.id}`} checked={selection.isSelected(line.id)} onChange={() => selection.toggle(line.id)} disabled={invoiceEditingLocked || editing} />
                  <td className="px-4 py-2">
                    {isEditing && <input type="hidden" name="lot_id" value={line.id} />}
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
      <ConfirmationDialog
        open={deleteRequest !== null}
        title={`Delete ${deleteRequest?.length === 1 ? "lot" : `${deleteRequest?.length ?? 0} lots`}?`}
        description="This permanently removes the selected lots and their related acknowledgement, valuation, and sale records. This cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onCancel={() => setDeleteRequest(null)}
        onConfirm={confirmDelete}
      />
      </ListSurface>
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
