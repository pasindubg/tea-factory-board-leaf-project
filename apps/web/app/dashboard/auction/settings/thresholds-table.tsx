"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { saveBrokerGradeThreshold } from "../actions";

export type ThresholdTableRow = {
  key: string;
  brokerId: string;
  brokerName: string;
  gradeId: string;
  gradeCode: string;
  minNetKg: number;
  applies: boolean;
};

const COLUMNS: EntityListColumn<ThresholdTableRow>[] = [
  { key: "brokerName", label: "Broker", accessor: (row) => row.brokerName, sortable: true, filter: "select", cellClassName: "font-medium" },
  { key: "gradeCode", label: "Grade", accessor: (row) => row.gradeCode, sortable: true, filter: "select" },
  {
    key: "minNetKg",
    label: "Min net kg",
    accessor: (row) => row.minNetKg,
    sortable: true,
    headerClassName: "text-right",
    cellClassName: "text-right tabular-nums",
    render: (row) => row.minNetKg.toFixed(2),
    edit: (row, { formId }) => (
      <input
        form={formId}
        name="min_net_kg"
        type="number"
        min="0"
        step="0.01"
        defaultValue={row.minNetKg.toFixed(2)}
        className="h-8 w-28 rounded-md border border-stone-300 bg-white px-2 text-right text-sm dark:border-stone-600 dark:bg-stone-900"
      />
    ),
  },
  {
    key: "applies",
    label: "Apply",
    accessor: (row) => row.applies ? "Applied" : "Not applied",
    sortable: true,
    filter: "select",
    filterOptions: [{ value: "Applied", label: "Applied" }, { value: "Not applied", label: "Not applied" }],
    render: (row) => <ApplyBadge applies={row.applies} />,
    edit: (row, { formId }) => <input form={formId} name="applies" type="checkbox" defaultChecked={row.applies} className="h-4 w-4 rounded border-stone-300 text-green-700 focus:ring-green-700" />,
  },
];

const LIST: ListDefinition<ThresholdTableRow> = {
  columns: COLUMNS,
  selectionMode: "single",
  add: false,
  edit: true,
  delete: false,
};

export function ThresholdsTable({ rows, isOwner }: { rows: ThresholdTableRow[]; isOwner: boolean }) {
  return (
    <EntityList
      resource={{ key: "auction.broker-grade-thresholds" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.key}
      rowLabel={(row) => `${row.brokerName} ${row.gradeCode}`}
      title="Broker min-kg shutout thresholds"
      description="Applied thresholds mark factory-entered lots as shutout immediately when net kg is below the broker and grade rule."
      emptyMessage="Add brokers and active grades before configuring thresholds."
      edit={{
        canEdit: isOwner,
        action: (row, formData) => {
          formData.set("broker_id", row.brokerId);
          formData.set("grade_id", row.gradeId);
          return saveBrokerGradeThreshold(formData);
        },
      }}
    />
  );
}

function ApplyBadge({ applies }: { applies: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${applies ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
      {applies ? "Applied" : "Not applied"}
    </span>
  );
}
