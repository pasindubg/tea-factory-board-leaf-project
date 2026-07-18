"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import type { SupplierTierAssignmentListRow } from "@/lib/list-resources";
import { assignTier } from "../actions";

export type TierAssignmentRow = SupplierTierAssignmentListRow;
export type TierSupplierOption = { id: string; name: string; area: string | null };
export type TierOption = { id: string; name: string };

const COLUMNS: EntityListColumn<TierAssignmentRow>[] = [
  { key: "supplierName", label: "Supplier", accessor: (row) => row.supplierName, sortable: true, filter: "text", render: (row) => <span className="font-medium">{row.supplierName}</span> },
  { key: "area", label: "Area", accessor: (row) => row.area ?? null, sortable: true, filter: "select", cellClassName: "text-stone-500 dark:text-stone-400", render: (row) => row.area ?? "—" },
  { key: "tierName", label: "Current tier", accessor: (row) => row.tierName ?? "Standard (none)", sortable: true, filter: "select", render: (row) => row.tierName ?? <span className="text-stone-400 dark:text-stone-500">Standard (none)</span> },
  { key: "effectiveFrom", label: "Since", accessor: (row) => row.effectiveFrom ?? null, sortable: true, searchInput: "date", cellClassName: "text-stone-500 dark:text-stone-400", render: (row) => row.effectiveFrom ?? "—" },
  { key: "source", label: "Source", accessor: (row) => row.source ?? null, sortable: true, filter: "select", cellClassName: "text-stone-500 dark:text-stone-400", render: (row) => row.source ?? "—" },
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
  const canAssign = canManage && suppliers.length > 0 && tiers.length > 0;
  const createReason = !canManage
    ? "Only owners and managers can assign quality tiers."
    : suppliers.length === 0
      ? "There are no active suppliers to assign."
      : tiers.length === 0
        ? "Add an active quality tier in Payment settings first."
      : "Finish the current tier assignment first.";

  return (
    <EntityList
      resource={{ key: "payments.tier-assignments" }}
      initialRows={initialRows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.supplierName}
      title="Supplier quality tiers"
      description="Current effective-dated tier for every active supplier. A new assignment closes the previous assignment automatically."
      emptyMessage="No active suppliers."
      canCreate={canAssign}
      create={{
        action: assignTier,
        label: "Assign tier",
        panelTitle: "Assign a supplier to a quality tier",
        disabledReason: createReason,
        render: ({ action, close }) => <form
          action={action}
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
          <button type="button" onClick={close} className="rounded-md border border-stone-300 px-4 py-2 text-sm dark:border-stone-600">
            Cancel
          </button>
        </form>,
      }}
    />
  );
}
