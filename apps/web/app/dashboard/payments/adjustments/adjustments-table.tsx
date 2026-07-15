"use client";

import { useState } from "react";
import { lkr } from "@/lib/money";
import { addAdjustment, deleteAdjustment } from "../actions";
import {
  ListCommandToolbar,
  ListCreatePanel,
  ListSearchPanel,
  ListSelectionCell,
  ListSelectionHeader,
  ListSurface,
  SortButton,
  useFrameworkListData,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

const KIND_LABELS: Record<string, string> = {
  advance: "Advance / loan",
  transport: "Transport",
  water_penalty: "Water penalty",
  other: "Other deduction",
  bonus: "One-off bonus",
};

export type AdjustmentRow = {
  id: string;
  occurredOn: string;
  supplierName: string;
  kind: string;
  label: string | null;
  amount: string | null;
  percent: string | null;
};

type SupplierOption = { id: string; name: string };

const COLUMNS: ColumnDef<AdjustmentRow>[] = [
  { key: "occurredOn", label: "Date", accessor: (row) => row.occurredOn, sortable: true },
  { key: "supplierName", label: "Supplier", accessor: (row) => row.supplierName, sortable: true, filter: "select" },
  { key: "kind", label: "Kind", accessor: (row) => KIND_LABELS[row.kind] ?? row.kind, sortable: true, filter: "select" },
  { key: "label", label: "Detail", accessor: (row) => row.label ?? null, sortable: true, filter: "text" },
  { key: "value", label: "Value", accessor: (row) => (row.percent != null ? Number(row.percent) : Number(row.amount ?? 0)), sortable: true },
];

const LIST: ListDefinition<AdjustmentRow> = {
  columns: COLUMNS,
  selectionMode: "multi",
  add: true,
  delete: true,
};

const input = "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none dark:border-stone-600 dark:bg-stone-900 dark:focus:border-green-500";
const today = () => new Date().toISOString().slice(0, 10);

export function AdjustmentsTable({
  rows: initialRows,
  suppliers,
  waterDefault,
  canManage,
}: {
  rows: AdjustmentRow[];
  suppliers: SupplierOption[];
  waterDefault: string;
  canManage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { rows, refreshing, mutate, mutationAction } = useFrameworkListData({
    initialRows,
    resource: { key: "payments.adjustments" },
  });
  const controls = useListControls(rows, LIST.columns);
  const visibleRows = controls.rows;
  const selection = useListSelection(rows, { mode: LIST.selectionMode ?? "multi", getId: (row) => row.id });

  async function confirmDelete() {
    const ids = [...selection.selectedIds];
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      await mutate(async () => {
        for (const id of ids) {
          const formData = new FormData();
          formData.set("id", id);
          const result = await deleteAdjustment(formData);
          if (!result.ok) return result;
        }
        return { ok: true, notice: `${ids.length} adjustment${ids.length === 1 ? "" : "s"} removed.` };
      }, { onSuccess: selection.clear });
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <ListSurface
      title="Advances and adjustments"
      description="Effective-dated additions and deductions applied when statements are regenerated."
      onCreate={() => setAdding(true)}
      canCreate={canManage && !adding}
      createDisabledReason={canManage ? "Finish adding the current adjustment first." : "Only owners and managers can add adjustments."}
      createLabel="New adjustment"
      refreshing={refreshing}
    >
      <ListCommandToolbar
        mode={LIST.selectionMode ?? "multi"}
        count={selection.selectedCount}
        enableDelete={canManage && Boolean(LIST.delete)}
        onDelete={{ onClick: () => setConfirmingDelete(true), disabled: selection.selectedCount === 0, busy: deleting }}
      />
      <ListCreatePanel open={adding} title="Add an advance or adjustment">
        <form action={mutationAction(addAdjustment, { onSuccess: () => setAdding(false) })} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Supplier<select name="supplier_id" required defaultValue="" className={`${input} w-52`}><option value="" disabled>Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <label className="text-sm">Kind<select name="kind" required defaultValue="advance" className={`${input} w-44`}>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm">Mode<select name="mode" defaultValue="amount" className={`${input} w-36`}><option value="amount">Amount (LKR)</option><option value="percent">Percent (%)</option></select></label>
          <label className="text-sm">Value<input name="value" type="number" step="0.01" min="0.01" required placeholder={`e.g. ${waterDefault}`} className={`${input} w-28`} /></label>
          <label className="text-sm">Label<input name="label" placeholder="optional" className={`${input} w-40`} /></label>
          <label className="text-sm">Date<input name="occurred_on" type="date" defaultValue={today()} required className={`${input} w-44`} /></label>
          <SubmitButton pendingText="Adding…" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600">Add</SubmitButton>
          <button type="button" onClick={() => setAdding(false)} className="rounded-md border border-stone-300 px-4 py-2 text-sm dark:border-stone-600">Cancel</button>
        </form>
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Default water penalty: {waterDefault}%</p>
      </ListCreatePanel>
      <ListSearchPanel columns={LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
            <ListSelectionHeader mode={LIST.selectionMode ?? "multi"} scope="payment-adjustments" checked={selection.allVisibleSelected(visibleRows)} onChange={() => selection.toggleVisible(visibleRows)} />
            {COLUMNS.map((column) => <th key={column.key} className={`px-4 py-3 ${column.key === "value" ? "text-right" : ""}`}>{column.sortable ? <SortButton col={column} controls={controls} /> : column.label}</th>)}
          </tr></thead>
          <tbody>
            {visibleRows.map((adjustment) => <tr key={adjustment.id} {...selection.rowProps(adjustment.id)} className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(adjustment.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}>
              <ListSelectionCell mode={LIST.selectionMode ?? "multi"} scope="payment-adjustments" id={adjustment.id} label={`${adjustment.supplierName} ${adjustment.occurredOn}`} checked={selection.isSelected(adjustment.id)} onChange={() => selection.toggle(adjustment.id)} />
              <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{adjustment.occurredOn}</td>
              <td className="px-4 py-3 font-medium">{adjustment.supplierName}</td>
              <td className="px-4 py-3">{KIND_LABELS[adjustment.kind] ?? adjustment.kind}</td>
              <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{adjustment.label ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums">{adjustment.percent != null ? `${Number(adjustment.percent).toFixed(2)}%` : lkr(adjustment.amount)}</td>
            </tr>)}
            {visibleRows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400">{rows.length ? "No adjustments match these filters." : "No advances or deductions recorded."}</td></tr>}
          </tbody>
        </table>
      </div>
      <ConfirmationDialog open={confirmingDelete} title={`Delete ${selection.selectedCount} adjustment${selection.selectedCount === 1 ? "" : "s"}?`} description="Statements already generated will not change until they are regenerated." confirmLabel="Delete" destructive busy={deleting} onCancel={() => setConfirmingDelete(false)} onConfirm={confirmDelete} />
    </ListSurface>
  );
}
