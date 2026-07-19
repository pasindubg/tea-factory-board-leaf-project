"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { createMark, deleteMark, updateMark } from "../actions";

export type MarkRow = { id: string; code: string; name: string; address: string | null };

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";

const COLUMNS: EntityListColumn<MarkRow>[] = [
  {
    key: "code",
    label: "Code",
    accessor: (row) => row.code,
    sortable: true,
    filter: "text",
    cellClassName: "font-medium",
    edit: (row, { formId }) => <input form={formId} name="code" required defaultValue={row.code} className={input} />,
  },
  {
    key: "name",
    label: "Name",
    accessor: (row) => row.name,
    sortable: true,
    filter: "text",
    edit: (row, { formId }) => <input form={formId} name="name" required defaultValue={row.name} className={input} />,
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

const LIST: ListDefinition<MarkRow> = {
  columns: COLUMNS,
  selectionMode: "single",
  add: true,
  edit: true,
  delete: true,
};

export function MarksTable({ rows, isOwner }: { rows: MarkRow[]; isOwner: boolean }) {
  return (
    <EntityList
      resource={{ key: "auction.marks" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.code}
      title="Marks"
      emptyMessage="No marks yet."
      canCreate={isOwner}
      create={{
        action: createMark,
        label: "New mark",
        panelTitle: "Add estate mark",
        disabledReason: isOwner ? "Finish the current mark change first." : "Only the owner can add marks.",
        render: ({ action }) => (
          <form action={action} className="grid gap-3 sm:grid-cols-3">
            <input name="code" required placeholder="MF1530" className={input} />
            <input name="name" required placeholder="KUMUDU" className={input} />
            <div className="flex gap-2">
              <input name="address" placeholder="Address" className={input} />
              <SubmitButton pendingText="Adding…" className="shrink-0 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">Add</SubmitButton>
            </div>
          </form>
        ),
      }}
      edit={{
        canEdit: isOwner,
        action: (row, formData) => updateMark(row.id, formData),
      }}
      canDelete={isOwner}
      deleteAction={{
        action: async (ids) => deleteMark(ids[0]),
        title: () => "Delete mark?",
        description: () => "This mark will be permanently removed. If another record uses it, deletion will be blocked with the dependent record type.",
      }}
    />
  );
}
