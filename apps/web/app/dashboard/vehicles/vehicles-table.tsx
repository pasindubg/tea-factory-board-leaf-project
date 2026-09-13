"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import type { VehicleListRow } from "@/lib/list-resources";
import { createVehicle, setSelectedVehiclesActive, updateVehicle } from "./actions";

export type VehicleRow = VehicleListRow;

const input = "w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 focus:border-green-600 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";
const cellInput = "w-full min-w-24 rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900";

const COLUMNS: EntityListColumn<VehicleRow>[] = [
  {
    key: "vehicleNo",
    label: "Vehicle no",
    accessor: (row) => row.vehicleNo,
    sortable: true,
    filter: "text",
    lov: false,
    cellClassName: "font-medium",
    edit: (row, { formId }) => <input form={formId} name="vehicle_no" aria-label="Vehicle number" required defaultValue={row.vehicleNo} className={input} />,
  },
  {
    key: "makeModel",
    label: "Make / model",
    accessor: (row) => row.makeModel ?? null,
    sortable: true,
    filter: "text",
    lov: false,
    render: (row) => row.makeModel ?? "—",
    edit: (row, { formId }) => <input form={formId} name="make_model" aria-label="Make and model" defaultValue={row.makeModel ?? ""} className={input} />,
  },
  {
    key: "capacityKg",
    label: "Capacity (kg)",
    accessor: (row) => (row.capacityKg == null ? null : Number(row.capacityKg)),
    sortable: true,
    filter: "text",
    lov: false,
    minWidth: 110,
    render: (row) => (row.capacityKg == null ? "—" : Number(row.capacityKg).toLocaleString()),
    edit: (row, { formId }) => <input form={formId} name="capacity_kg" aria-label="Capacity in kg" type="number" min="0" step="0.01" defaultValue={row.capacityKg == null ? "" : String(row.capacityKg)} className={input} />,
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
} satisfies ListDefinition<VehicleRow>;

export function VehiclesTable({ rows }: { rows: VehicleRow[] }) {
  return (
    <EntityList
      resource={{ key: "leaf.vehicles" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.vehicleNo}
      title="Vehicles"
      description="The vans that run the collection lines."
      emptyMessage="No vehicles yet. Use New vehicle to add the first one."
      create={{
        action: createVehicle,
        label: "New vehicle",
        disabledReason: "Finish the current vehicle change first.",
        renderRow: ({ formId }) => (
          <>
            <td className="px-4 py-3"><input form={formId} name="vehicle_no" required aria-label="Vehicle number" className={cellInput} /></td>
            <td className="px-4 py-3"><input form={formId} name="make_model" aria-label="Make and model" className={cellInput} /></td>
            <td className="px-4 py-3"><input form={formId} name="capacity_kg" type="number" min="0" step="0.01" aria-label="Capacity in kg" className={`${cellInput} text-right`} /></td>
            <td className="px-4 py-3" />
          </>
        ),
      }}
      createPlacement="toolbar"
      edit={{ action: (row, formData) => updateVehicle(row.id, formData) }}
      commands={[
        {
          id: "deactivate",
          label: "Deactivate",
          disabled: ({ selectedRows }) => selectedRows.length === 0 || !selectedRows.some((row) => row.active),
          run: ({ selectedRows }) => setVehiclesActive(selectedRows, false),
        },
        {
          id: "activate",
          label: "Reactivate",
          disabled: ({ selectedRows }) => selectedRows.length === 0 || !selectedRows.some((row) => !row.active),
          run: ({ selectedRows }) => setVehiclesActive(selectedRows, true),
        },
      ]}
    />
  );
}

function setVehiclesActive(rows: VehicleRow[], active: boolean) {
  const formData = new FormData();
  rows.forEach((row) => formData.append("selected_ids", row.id));
  return setSelectedVehiclesActive(active, formData);
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400" : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"}`}>
      {active ? "active" : "inactive"}
    </span>
  );
}
