"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { createWeighing } from "./actions";
import { WeighingForm } from "./weighing-form";

export type WeighingRow = {
  id: string;
  collectedAt: string;
  supplierName: string;
  collectorName: string;
  weightKg: number;
  notes: string | null;
};

type CreateOptions = {
  suppliers: { id: string; name: string; area: string | null }[];
  collectors: { id: string; name: string }[];
  tiers: { id: string; name: string }[];
  assignments: Map<string, string>;
  isCollector: boolean;
  ownCollectorName?: string;
  transportPerKg: number;
  waterPenaltyLabel: string | null;
  canCreate: boolean;
  disabledReason?: string;
};

const COLUMNS: EntityListColumn<WeighingRow>[] = [
  { key: "collectedAt", label: "Time", accessor: (row) => row.collectedAt, sortable: true, render: (row) => new Date(row.collectedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) },
  { key: "supplierName", label: "Supplier", accessor: (row) => row.supplierName, sortable: true, filter: "select", render: (row) => <span className="font-medium">{row.supplierName}</span> },
  { key: "collectorName", label: "Collector", accessor: (row) => row.collectorName, sortable: true, filter: "select" },
  { key: "weightKg", label: "Weight (kg)", accessor: (row) => row.weightKg, sortable: true, searchInput: "number", cellClassName: "text-right tabular-nums", render: (row) => row.weightKg.toFixed(2) },
  { key: "notes", label: "Notes", accessor: (row) => row.notes ?? null, sortable: true, filter: "text", lov: false, cellClassName: "text-stone-500 dark:text-stone-400", render: (row) => row.notes ?? "" },
];

const LIST = { columns: COLUMNS, selectionMode: "single", add: true } satisfies ListDefinition<WeighingRow>;

export function WeighingsTable({
  rows: initialRows,
  resourceParams,
  createOptions,
}: {
  rows: WeighingRow[];
  resourceParams: { from?: string; to?: string; supplierId?: string; collectorId?: string };
  createOptions: CreateOptions;
}) {
  return (
    <EntityList
      resource={{ key: "leaf.weighings", params: resourceParams }}
      initialRows={initialRows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `${row.supplierName} weighing`}
      title="Weighings"
      description="Leaf intake records for the selected period and filters."
      emptyMessage="No weighings found."
      canCreate={createOptions.canCreate}
      create={{
        action: createWeighing,
        label: "Record weighing",
        panelTitle: "Record weighing",
        disabledReason: createOptions.disabledReason ?? "Finish recording the current weighing first.",
        render: ({ action, close }) => <WeighingForm {...createOptions} action={action} onCancel={close} />,
      }}
      beforeTable={(rows) => <WeighingTotal rows={rows} />}
    />
  );
}

function WeighingTotal({ rows = [] }: { rows?: WeighingRow[] }) {
  const totalKg = rows.reduce((sum, row) => sum + row.weightKg, 0);
  return <span className="rounded-md bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 dark:bg-green-950 dark:text-green-400">Total: {totalKg.toFixed(2)} kg ({rows.length})</span>;
}
