"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import type { CollectorListRow } from "@/lib/list-resources";
import { createCollector, setSelectedCollectorsActive, updateCollector } from "./actions";

export type CollectorRow = CollectorListRow;

const input = "w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 focus:border-green-600 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";

const COLUMNS: EntityListColumn<CollectorRow>[] = [
  {
    key: "name",
    label: "Name",
    accessor: (row) => row.name,
    sortable: true,
    filter: "text",
    lov: false,
    cellClassName: "font-medium",
    edit: (row, { formId }) => <input form={formId} name="name" aria-label="Collector name" required defaultValue={row.name} className={input} />,
  },
  {
    key: "area",
    label: "Area",
    accessor: (row) => row.area ?? null,
    sortable: true,
    filter: "select",
    render: (row) => row.area ?? "—",
    edit: (row, { formId }) => <input form={formId} name="area" aria-label="Area" defaultValue={row.area ?? ""} className={input} />,
  },
  {
    key: "phone",
    label: "Phone",
    accessor: (row) => row.phone ?? null,
    sortable: true,
    filter: "text",
    lov: false,
    render: (row) => row.phone ?? "—",
    edit: (row, { formId }) => <input form={formId} name="phone" aria-label="Phone" defaultValue={row.phone ?? ""} className={input} />,
  },
  {
    key: "nicNumber",
    label: "NIC",
    accessor: (row) => row.nicNumber ?? null,
    sortable: true,
    filter: "text",
    lov: false,
    render: (row) => row.nicNumber ?? "—",
    edit: (row, { formId }) => <input form={formId} name="nic_number" aria-label="NIC number" defaultValue={row.nicNumber ?? ""} className={input} />,
  },
  {
    key: "active",
    label: "Status",
    accessor: (row) => row.active ? "active" : "inactive",
    sortable: true,
    filter: "select",
    filterOptions: [{ value: "active", label: "active" }, { value: "inactive", label: "inactive" }],
    render: (row) => <StatusBadge active={row.active} />,
  },
];

const LIST = {
  columns: COLUMNS,
  selectionMode: "multi",
  add: true,
  edit: true,
  delete: false,
} satisfies ListDefinition<CollectorRow>;

export function CollectorsTable({ rows }: { rows: CollectorRow[] }) {
  return (
    <EntityList
      resource={{ key: "leaf.collectors" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.name}
      title="Collectors"
      description="Factory collectors and the areas they serve."
      emptyMessage="No collectors yet. Use New collector to add the first one."
      create={{
        action: createCollector,
        label: "New collector",
        panelTitle: "Add collector",
        disabledReason: "Finish the current collector change first.",
        render: ({ action, close }) => (
          <form action={action} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Name *"><input name="name" required className={input} /></Field>
            <Field label="Phone"><input name="phone" className={input} /></Field>
            <Field label="NIC number"><input name="nic_number" className={input} /></Field>
            <Field label="Area"><input name="area" className={input} /></Field>
            <div className="flex items-center justify-end gap-2 sm:col-span-2 xl:col-span-4">
              <button type="button" onClick={close} className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium dark:border-stone-600">Cancel</button>
              <SubmitButton pendingText="Adding…" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600">Add collector</SubmitButton>
            </div>
          </form>
        ),
      }}
      edit={{
        action: (row, formData) => updateCollector(row.id, formData),
      }}
      commands={[
        {
          id: "deactivate",
          label: "Deactivate",
          disabled: ({ selectedRows }) => selectedRows.length === 0 || !selectedRows.some((row) => row.active),
          run: ({ selectedRows }) => setCollectorsActive(selectedRows, false),
        },
        {
          id: "activate",
          label: "Reactivate",
          disabled: ({ selectedRows }) => selectedRows.length === 0 || !selectedRows.some((row) => !row.active),
          run: ({ selectedRows }) => setCollectorsActive(selectedRows, true),
        },
      ]}
    />
  );
}

function setCollectorsActive(rows: CollectorRow[], active: boolean) {
  const formData = new FormData();
  rows.forEach((row) => formData.append("selected_ids", row.id));
  return setSelectedCollectorsActive(active, formData);
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400" : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"}`}>
      {active ? "active" : "inactive"}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-sm font-medium text-stone-700 dark:text-stone-300"><span className="mb-1 block">{label}</span>{children}</label>;
}
