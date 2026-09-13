"use client";

import Link from "next/link";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { LovCombobox } from "@/components/lov-combobox";
import type { LineListRow } from "@/lib/list-resources";
import { LineDriversTable } from "./[id]/line-drivers-table";
import { createLine, setSelectedLinesActive, updateLine } from "./actions";

export type LineRow = LineListRow;

const input = "w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 focus:border-green-600 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";
const cellInput = "w-full min-w-24 rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900";

const COLUMNS: EntityListColumn<LineRow>[] = [
  {
    key: "lineNo",
    label: "Line no",
    accessor: (row) => row.lineNo,
    sortable: true,
    filter: "text",
    lov: false,
    minWidth: 110,
    cellClassName: "font-medium",
    render: (row) => (
      <Link href={`/dashboard/lines/${row.id}`} className="text-green-700 hover:underline dark:text-green-500">
        {row.lineNo}
      </Link>
    ),
    edit: (row, { formId }) => <input form={formId} name="line_no" aria-label="Line number" required defaultValue={row.lineNo} className={input} />,
  },
  {
    key: "name",
    label: "Name",
    accessor: (row) => row.name ?? null,
    sortable: true,
    filter: "text",
    lov: false,
    render: (row) => row.name ?? "—",
    edit: (row, { formId }) => <input form={formId} name="name" aria-label="Line name" defaultValue={row.name ?? ""} className={input} />,
  },
  {
    key: "vehicleNo",
    label: "Vehicle",
    accessor: (row) => row.vehicleNo,
    sortable: true,
    filter: "text",
    lovSource: "leaf.vehicles",
    lovEdit: true,
    lovName: "vehicle_id",
    lovValue: (row) => row.vehicleId ?? "",
    minWidth: 130,
  },
  {
    key: "driverNames",
    label: "Drivers",
    accessor: (row) => row.driverNames,
    sortable: false,
    filter: "text",
    lov: false,
  },
  {
    key: "customerCount",
    label: "Customers",
    accessor: (row) => row.customerCount,
    sortable: true,
    filter: "text",
    lov: false,
    minWidth: 100,
    cellClassName: "text-right tabular-nums",
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
} satisfies ListDefinition<LineRow>;

export function LinesTable({ rows }: { rows: LineRow[] }) {
  return (
    <EntityList
      resource={{ key: "leaf.lines" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.lineNo}
      title="Lines"
      description="Collection routes. Open a line to assign drivers and see its customers."
      emptyMessage="No lines yet. Use New line to add the first one."
      create={{
        action: createLine,
        label: "New line",
        disabledReason: "Finish the current line change first.",
        renderRow: ({ formId }) => (
          <>
            <td className="px-4 py-3"><input form={formId} name="line_no" required aria-label="Line number" className={cellInput} /></td>
            <td className="px-4 py-3"><input form={formId} name="name" aria-label="Line name" className={cellInput} /></td>
            <td className="px-4 py-3"><LovCombobox source="leaf.vehicles" name="vehicle_id" formId={formId} ariaLabel="Vehicle" /></td>
            <td className="px-4 py-3 text-xs text-stone-400 dark:text-stone-500">assign after saving</td>
            <td className="px-4 py-3" />
            <td className="px-4 py-3" />
          </>
        ),
      }}
      createPlacement="toolbar"
      edit={{ action: (row, formData) => updateLine(row.id, formData) }}
      commands={[
        {
          id: "drivers",
          label: "Drivers",
          disabled: ({ selectedRows }) => selectedRows.length !== 1,
          disabledReason: ({ selectedRows }) =>
            selectedRows.length === 1 ? undefined : "Select one line to manage its drivers.",
          assistant: {
            title: ({ selectedRows }) => `Line ${selectedRows[0]?.lineNo ?? ""}`,
            description: ({ selectedRows }) => {
              const line = selectedRows[0];
              if (!line) return "";
              const vehicle = line.vehicleNo === "—" ? "no vehicle" : `vehicle ${line.vehicleNo}`;
              return `${line.name ? `${line.name} · ` : ""}${vehicle} · ${line.customerCount} customer${line.customerCount === 1 ? "" : "s"}`;
            },
            // The drawer starts with no rows and the framework list fetches
            // them on mount; assignDriverToLine invalidates leaf.lines, so the
            // DRIVERS cell behind the drawer updates on its own.
            render: ({ command }) => {
              const line = command.selectedRows[0];
              return line ? <LineDriversTable lineId={line.id} rows={[]} /> : null;
            },
          },
        },
        {
          id: "deactivate",
          label: "Deactivate",
          disabled: ({ selectedRows }) => selectedRows.length === 0 || !selectedRows.some((row) => row.active),
          run: ({ selectedRows }) => setLinesActive(selectedRows, false),
        },
        {
          id: "activate",
          label: "Reactivate",
          disabled: ({ selectedRows }) => selectedRows.length === 0 || !selectedRows.some((row) => !row.active),
          run: ({ selectedRows }) => setLinesActive(selectedRows, true),
        },
      ]}
    />
  );
}

function setLinesActive(rows: LineRow[], active: boolean) {
  const formData = new FormData();
  rows.forEach((row) => formData.append("selected_ids", row.id));
  return setSelectedLinesActive(active, formData);
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400" : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"}`}>
      {active ? "active" : "inactive"}
    </span>
  );
}
