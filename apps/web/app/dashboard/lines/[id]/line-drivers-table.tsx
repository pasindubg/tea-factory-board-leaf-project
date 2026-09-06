"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { LovCombobox } from "@/components/lov-combobox";
import type { LineDriverListRow } from "@/lib/list-resources";
import { assignDriverToLine, removeSelectedLineDrivers } from "../actions";

export type LineDriverRow = LineDriverListRow;

const COLUMNS: EntityListColumn<LineDriverRow>[] = [
  {
    key: "driverName",
    label: "Driver",
    accessor: (row) => row.driverName,
    sortable: true,
    filter: "text",
    lov: false,
    cellClassName: "font-medium",
  },
  {
    key: "phone",
    label: "Phone",
    accessor: (row) => row.phone ?? null,
    sortable: true,
    filter: "text",
    lov: false,
    render: (row) => row.phone ?? "—",
  },
  {
    key: "licenceNo",
    label: "Licence no",
    accessor: (row) => row.licenceNo ?? null,
    sortable: true,
    filter: "text",
    lov: false,
    render: (row) => row.licenceNo ?? "—",
  },
];

const LIST = {
  columns: COLUMNS,
  selectionMode: "multi",
  add: true,
  edit: false,
  delete: false,
} satisfies ListDefinition<LineDriverRow>;

export function LineDriversTable({ lineId, rows }: { lineId: string; rows: LineDriverRow[] }) {
  return (
    <EntityList
      resource={{ key: "leaf.line-drivers", params: { lineId } }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.driverName}
      title="Drivers on this line"
      description="A line can be run by more than one driver."
      emptyMessage="No drivers assigned yet."
      create={{
        action: (formData) => assignDriverToLine(lineId, formData),
        label: "Assign driver",
        disabledReason: "Finish the current assignment first.",
        renderRow: ({ formId }) => (
          <>
            <td className="px-4 py-3"><LovCombobox source="leaf.drivers" name="driver_id" formId={formId} ariaLabel="Driver" required /></td>
            <td className="px-4 py-3" />
            <td className="px-4 py-3" />
          </>
        ),
      }}
      createPlacement="toolbar"
      commands={[
        {
          id: "unassign",
          label: "Unassign",
          disabled: ({ selectedRows }) => selectedRows.length === 0,
          confirm: {
            title: "Unassign drivers",
            description: "The selected drivers will no longer run this line.",
            confirmLabel: "Unassign",
          },
          run: ({ selectedRows }) => {
            const formData = new FormData();
            selectedRows.forEach((row) => formData.append("selected_ids", row.id));
            return removeSelectedLineDrivers(lineId, formData);
          },
        },
      ]}
    />
  );
}
