"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { createAuctionWarehouse, updateAuctionWarehouse } from "../actions";

export type WarehouseTableRow = { id: string; name: string; active: boolean };

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";

const COLUMNS: EntityListColumn<WarehouseTableRow>[] = [
  {
    key: "name",
    label: "Warehouse",
    accessor: (row) => row.name,
    sortable: true,
    filter: "text",
    edit: (row, { formId }) => <input form={formId} name="name" required defaultValue={row.name} className={input} />,
  },
  {
    key: "active",
    label: "State",
    accessor: (row) => row.active ? "Active" : "Inactive",
    sortable: true,
    filter: "select",
    filterOptions: [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }],
    render: (row) => <StateBadge active={row.active} />,
    edit: (row, { formId }) => (
      <label className="inline-flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
        <input form={formId} name="active" type="checkbox" defaultChecked={row.active} className="rounded border-stone-300" />
        Active
      </label>
    ),
  },
];

const LIST: ListDefinition<WarehouseTableRow> = {
  columns: COLUMNS,
  selectionMode: "single",
  add: true,
  edit: true,
  delete: false,
};

export function WarehousesTable({ rows, isOwner }: { rows: WarehouseTableRow[]; isOwner: boolean }) {
  return (
    <EntityList
      resource={{ key: "auction.warehouses" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.name}
      title="Warehouses"
      emptyMessage="No warehouses yet."
      canCreate={isOwner}
      create={{
        action: createAuctionWarehouse,
        label: "New warehouse",
        panelTitle: "Add warehouse",
        disabledReason: isOwner ? "Finish the current warehouse change first." : "Only the owner can add warehouses.",
        render: ({ action }) => (
          <form action={action} className="flex max-w-xl gap-2">
            <input name="name" required placeholder="Main warehouse" className={input} />
            <SubmitButton pendingText="Adding…" className="shrink-0 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">Add</SubmitButton>
          </form>
        ),
      }}
      edit={{
        canEdit: isOwner,
        saveLabel: "Save changes",
        action: (row, formData) => updateAuctionWarehouse(row.id, formData),
      }}
    />
  );
}

function StateBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}
