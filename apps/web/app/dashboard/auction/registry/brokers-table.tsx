"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { createBroker, deleteBroker, updateBroker } from "../actions";

export type BrokerRow = { id: string; name: string; vat_no: string | null; address: string | null };

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";

const COLUMNS: EntityListColumn<BrokerRow>[] = [
  {
    key: "name",
    label: "Name",
    accessor: (row) => row.name,
    sortable: true,
    filter: "text",
    cellClassName: "font-medium",
    edit: (row, { formId }) => <input form={formId} name="name" required defaultValue={row.name} className={input} />,
  },
  {
    key: "vat_no",
    label: "VAT no.",
    accessor: (row) => row.vat_no ?? null,
    sortable: true,
    filter: "text",
    render: (row) => row.vat_no ?? "—",
    edit: (row, { formId }) => <input form={formId} name="vat_no" defaultValue={row.vat_no ?? ""} className={input} />,
  },
  {
    key: "address",
    label: "Address",
    accessor: (row) => row.address ?? null,
    sortable: true,
    filter: "text",
    render: (row) => row.address ?? "—",
    edit: (row, { formId }) => <input form={formId} name="address" defaultValue={row.address ?? ""} className={input} />,
  },
];

const LIST: ListDefinition<BrokerRow> = {
  columns: COLUMNS,
  selectionMode: "single",
  add: true,
  edit: true,
  delete: true,
};

export function BrokersTable({ rows, isOwner }: { rows: BrokerRow[]; isOwner: boolean }) {
  return (
    <EntityList
      resource={{ key: "auction.brokers" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.name}
      title="Brokers"
      emptyMessage="No brokers yet."
      canCreate={isOwner}
      create={{
        action: createBroker,
        label: "New broker",
        panelTitle: "Add broker",
        disabledReason: isOwner ? "Finish the current broker change first." : "Only the owner can add brokers.",
        render: ({ action }) => (
          <form action={action} className="grid gap-3 sm:grid-cols-3">
            <input name="name" required placeholder="BPML Produce Marketing" className={input} />
            <input name="vat_no" placeholder="VAT no." className={input} />
            <div className="flex gap-2">
              <input name="address" placeholder="Address" className={input} />
              <SubmitButton pendingText="Adding…" className="shrink-0 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">Add</SubmitButton>
            </div>
          </form>
        ),
      }}
      edit={{
        canEdit: isOwner,
        action: (row, formData) => updateBroker(row.id, formData),
      }}
      canDelete={isOwner}
      deleteAction={{
        action: async (ids) => deleteBroker(ids[0]),
        title: () => "Delete broker?",
        description: () => "This broker will be permanently removed. If another record uses it, deletion will be blocked with the dependent record type.",
      }}
    />
  );
}
