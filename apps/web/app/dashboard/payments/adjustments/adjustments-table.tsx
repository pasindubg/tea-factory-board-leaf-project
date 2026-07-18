"use client";

import { lkr } from "@/lib/money";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { addAdjustment, deleteAdjustment } from "../actions";

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

const COLUMNS: EntityListColumn<AdjustmentRow>[] = [
  { key: "occurredOn", label: "Date", accessor: (row) => row.occurredOn, sortable: true, render: (row) => <span className="text-stone-500 dark:text-stone-400">{row.occurredOn}</span> },
  { key: "supplierName", label: "Supplier", accessor: (row) => row.supplierName, sortable: true, filter: "select", render: (row) => <span className="font-medium">{row.supplierName}</span> },
  { key: "kind", label: "Kind", accessor: (row) => KIND_LABELS[row.kind] ?? row.kind, sortable: true, filter: "select" },
  { key: "label", label: "Detail", accessor: (row) => row.label ?? null, sortable: true, filter: "text", render: (row) => <span className="text-stone-500 dark:text-stone-400">{row.label ?? "—"}</span> },
  {
    key: "value",
    label: "Value",
    accessor: (row) => (row.percent != null ? Number(row.percent) : Number(row.amount ?? 0)),
    sortable: true,
    cellClassName: "text-right tabular-nums",
    render: (row) => row.percent != null ? `${Number(row.percent).toFixed(2)}%` : lkr(row.amount),
  },
];

const LIST = {
  columns: COLUMNS,
  selectionMode: "multi",
  add: true,
  delete: true,
} satisfies ListDefinition<AdjustmentRow>;

const input = "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none dark:border-stone-600 dark:bg-stone-900 dark:focus:border-green-500";
const today = () => new Date().toISOString().slice(0, 10);

export function AdjustmentsTable({
  rows,
  suppliers,
  waterDefault,
  canManage,
}: {
  rows: AdjustmentRow[];
  suppliers: SupplierOption[];
  waterDefault: string;
  canManage: boolean;
}) {
  return (
    <EntityList
      resource={{ key: "payments.adjustments" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `${row.supplierName} ${row.occurredOn}`}
      canCreate={canManage}
      emptyMessage="No advances or deductions recorded."
      create={{
        action: addAdjustment,
        label: "New adjustment",
        panelTitle: "Add an advance or adjustment",
        disabledReason: canManage ? "Finish adding the current adjustment first." : "Only owners and managers can add adjustments.",
        render: ({ action, close }) => (
          <>
            <form action={action} className="flex flex-wrap items-end gap-3">
              <label className="text-sm">Supplier<select name="supplier_id" required defaultValue="" className={`${input} w-52`}><option value="" disabled>Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
              <label className="text-sm">Kind<select name="kind" required defaultValue="advance" className={`${input} w-44`}>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-sm">Mode<select name="mode" defaultValue="amount" className={`${input} w-36`}><option value="amount">Amount (LKR)</option><option value="percent">Percent (%)</option></select></label>
              <label className="text-sm">Value<input name="value" type="number" step="0.01" min="0.01" required placeholder={`e.g. ${waterDefault}`} className={`${input} w-28`} /></label>
              <label className="text-sm">Label<input name="label" placeholder="optional" className={`${input} w-40`} /></label>
              <label className="text-sm">Date<input name="occurred_on" type="date" defaultValue={today()} required className={`${input} w-44`} /></label>
              <SubmitButton pendingText="Adding…" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600">Add</SubmitButton>
              <button type="button" onClick={close} className="rounded-md border border-stone-300 px-4 py-2 text-sm dark:border-stone-600">Cancel</button>
            </form>
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Default water penalty: {waterDefault}%</p>
          </>
        ),
      }}
      canDelete={canManage}
      deleteAction={{
        action: async (ids) => {
          for (const id of ids) {
            const formData = new FormData();
            formData.set("id", id);
            const result = await deleteAdjustment(formData);
            if (!result.ok) return result;
          }
          return { ok: true, notice: `${ids.length} adjustment${ids.length === 1 ? "" : "s"} removed.` };
        },
        title: (count) => `Delete ${count} adjustment${count === 1 ? "" : "s"}?`,
        description: () => "Statements already generated will not change until they are regenerated.",
      }}
    />
  );
}
