"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import type { DriverListRow } from "@/lib/list-resources";
import { createDriver, setSelectedDriversActive, updateDriver } from "./actions";

export type DriverRow = DriverListRow;

const input = "w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 focus:border-green-600 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";
const cellInput = "w-full min-w-24 rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900";

const COLUMNS: EntityListColumn<DriverRow>[] = [
  {
    key: "name",
    label: "Name",
    accessor: (row) => row.name,
    sortable: true,
    filter: "text",
    lov: false,
    cellClassName: "font-medium",
    edit: (row, { formId }) => <input form={formId} name="name" aria-label="Driver name" required defaultValue={row.name} className={input} />,
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
    key: "licenceNo",
    label: "Licence no",
    accessor: (row) => row.licenceNo ?? null,
    sortable: true,
    filter: "text",
    lov: false,
    render: (row) => row.licenceNo ?? "—",
    edit: (row, { formId }) => <input form={formId} name="licence_no" aria-label="Licence number" defaultValue={row.licenceNo ?? ""} className={input} />,
  },
  {
    key: "active",
    label: "Status",
    accessor: (row) => (row.active ? "active" : "inactive"),
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
} satisfies ListDefinition<DriverRow>;

export function DriversTable({ rows }: { rows: DriverRow[] }) {
  return (
    <EntityList
      resource={{ key: "leaf.drivers" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.name}
      title="Drivers"
      description="Drivers who run the collection lines."
      emptyMessage="No drivers yet. Use New driver to add the first one."
      create={{
        action: createDriver,
        label: "New driver",
        disabledReason: "Finish the current driver change first.",
        renderRow: ({ formId }) => (
          <>
            <td className="px-4 py-3"><input form={formId} name="name" required aria-label="Driver name" className={cellInput} /></td>
            <td className="px-4 py-3"><input form={formId} name="phone" aria-label="Phone" className={cellInput} /></td>
            <td className="px-4 py-3"><input form={formId} name="nic_number" aria-label="NIC number" className={cellInput} /></td>
            <td className="px-4 py-3"><input form={formId} name="licence_no" aria-label="Licence number" className={cellInput} /></td>
            <td className="px-4 py-3" />
          </>
        ),
      }}
      createPlacement="toolbar"
      edit={{ action: (row, formData) => updateDriver(row.id, formData) }}
      commands={[
        {
          id: "deactivate",
          label: "Deactivate",
          disabled: ({ selectedRows }) => selectedRows.length === 0 || !selectedRows.some((row) => row.active),
          run: ({ selectedRows }) => setDriversActive(selectedRows, false),
        },
        {
          id: "activate",
          label: "Reactivate",
          disabled: ({ selectedRows }) => selectedRows.length === 0 || !selectedRows.some((row) => !row.active),
          run: ({ selectedRows }) => setDriversActive(selectedRows, true),
        },
      ]}
    />
  );
}

function setDriversActive(rows: DriverRow[], active: boolean) {
  const formData = new FormData();
  rows.forEach((row) => formData.append("selected_ids", row.id));
  return setSelectedDriversActive(active, formData);
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400" : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"}`}>
      {active ? "active" : "inactive"}
    </span>
  );
}
