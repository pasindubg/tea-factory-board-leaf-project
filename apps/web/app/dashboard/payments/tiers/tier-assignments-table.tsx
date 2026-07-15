"use client";

import { useState } from "react";
import {
  ListCommandToolbar,
  ListCreatePanel,
  ListSearchPanel,
  ListSurface,
  SortButton,
  useFrameworkListData,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import type { SupplierTierAssignmentListRow } from "@/lib/list-resources";
import { assignTier } from "../actions";

export type TierAssignmentRow = SupplierTierAssignmentListRow;
export type TierSupplierOption = { id: string; name: string; area: string | null };
export type TierOption = { id: string; name: string };

const COLUMNS: ColumnDef<TierAssignmentRow>[] = [
  { key: "supplierName", label: "Supplier", accessor: (row) => row.supplierName, sortable: true, filter: "text" },
  { key: "area", label: "Area", accessor: (row) => row.area ?? null, sortable: true, filter: "select" },
  { key: "tierName", label: "Current tier", accessor: (row) => row.tierName ?? "Standard (none)", sortable: true, filter: "select" },
  { key: "effectiveFrom", label: "Since", accessor: (row) => row.effectiveFrom ?? null, sortable: true, searchInput: "date" },
  { key: "source", label: "Source", accessor: (row) => row.source ?? null, sortable: true, filter: "select" },
];

const LIST = {
  columns: COLUMNS,
  selectionMode: "single",
  add: true,
  edit: false,
  delete: false,
} satisfies ListDefinition<TierAssignmentRow>;

const input = "mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-green-600 focus:outline-none dark:border-stone-600 dark:bg-stone-900 dark:focus:border-green-500";
const today = () => new Date().toISOString().slice(0, 10);

export function TierAssignmentsTable({
  rows: initialRows,
  suppliers,
  tiers,
  canManage,
}: {
  rows: TierAssignmentRow[];
  suppliers: TierSupplierOption[];
  tiers: TierOption[];
  canManage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const { rows, refreshing, mutationAction } = useFrameworkListData({
    initialRows,
    resource: { key: "payments.tier-assignments" },
  });
  const controls = useListControls(rows, LIST.columns);
  const visibleRows = controls.rows;
  const selection = useListSelection(rows, { mode: LIST.selectionMode, getId: (row) => row.id });
  const canAssign = canManage && suppliers.length > 0 && tiers.length > 0 && !adding;
  const createReason = !canManage
    ? "Only owners and managers can assign quality tiers."
    : suppliers.length === 0
      ? "There are no active suppliers to assign."
      : tiers.length === 0
        ? "Add an active quality tier in Payment settings first."
        : "Finish the current tier assignment first.";

  return (
    <ListSurface
      title="Supplier quality tiers"
      description="Current effective-dated tier for every active supplier. A new assignment closes the previous assignment automatically."
      onCreate={() => setAdding(true)}
      canCreate={Boolean(LIST.add) && canAssign}
      createDisabledReason={createReason}
      createLabel="Assign tier"
      refreshing={refreshing}
    >
      <ListCommandToolbar mode={LIST.selectionMode} count={selection.selectedCount} />
      <ListCreatePanel open={adding} title="Assign a supplier to a quality tier">
        <form
          action={mutationAction(assignTier, {
            onSuccess: () => {
              setAdding(false);
              selection.clear();
            },
          })}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="text-sm">
            Supplier
            <select name="supplier_id" required defaultValue="" className={`${input} w-56`}>
              <option value="" disabled>Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}{supplier.area ? ` (${supplier.area})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Tier
            <select name="tier_id" required defaultValue="" className={`${input} w-44`}>
              <option value="" disabled>Select tier</option>
              {tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            Effective from
            <input name="effective_from" type="date" defaultValue={today()} required className={`${input} w-44`} />
          </label>
          <label className="text-sm">
            Note
            <input name="note" placeholder="optional" className={`${input} w-44`} />
          </label>
          <SubmitButton pendingText="Assigning…" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700">
            Assign
          </SubmitButton>
          <button type="button" onClick={() => setAdding(false)} className="rounded-md border border-stone-300 px-4 py-2 text-sm dark:border-stone-600">
            Cancel
          </button>
        </form>
      </ListCreatePanel>

      <ListSearchPanel columns={LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              {LIST.columns.map((column) => (
                <th key={column.key} className="px-4 py-3">
                  {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((supplier) => (
              <tr
                key={supplier.id}
                {...selection.rowProps(supplier.id, adding || refreshing)}
                className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(supplier.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
              >
                <td className="px-4 py-3 font-medium">{supplier.supplierName}</td>
                <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{supplier.area ?? "—"}</td>
                <td className="px-4 py-3">{supplier.tierName ?? <span className="text-stone-400 dark:text-stone-500">Standard (none)</span>}</td>
                <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{supplier.effectiveFrom ?? "—"}</td>
                <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{supplier.source ?? "—"}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                  {rows.length ? "No suppliers match these filters." : "No active suppliers."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ListSurface>
  );
}
