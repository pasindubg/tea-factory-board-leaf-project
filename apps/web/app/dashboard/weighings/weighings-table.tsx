"use client";

import { useState } from "react";
import {
  ListCommandToolbar,
  ListCreatePanel,
  ListSearchPanel,
  ListSurface,
  SortButton,
  useFrameworkListData,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";
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

const COLUMNS: ColumnDef<WeighingRow>[] = [
  { key: "collectedAt", label: "Time", accessor: (row) => row.collectedAt, sortable: true },
  { key: "supplierName", label: "Supplier", accessor: (row) => row.supplierName, sortable: true, filter: "select" },
  { key: "collectorName", label: "Collector", accessor: (row) => row.collectorName, sortable: true, filter: "select" },
  { key: "weightKg", label: "Weight (kg)", accessor: (row) => row.weightKg, sortable: true, searchInput: "number" },
  { key: "notes", label: "Notes", accessor: (row) => row.notes ?? null, sortable: true, filter: "text", lov: false },
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
  const [adding, setAdding] = useState(false);
  const { rows, refreshing, mutationAction } = useFrameworkListData({
    initialRows,
    resource: { key: "leaf.weighings", params: resourceParams },
  });
  const controls = useListControls(rows, LIST.columns);
  const visibleRows = controls.rows;
  const selection = useListSelection(rows, { mode: LIST.selectionMode, getId: (row) => row.id });
  const totalKg = rows.reduce((sum, row) => sum + row.weightKg, 0);

  return (
    <ListSurface
      title="Weighings"
      description="Leaf intake records for the selected period and filters."
      onCreate={() => setAdding(true)}
      canCreate={createOptions.canCreate && !adding}
      createDisabledReason={adding ? "Finish recording the current weighing first." : createOptions.disabledReason}
      createLabel="Record weighing"
      actions={<span className="rounded-md bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 dark:bg-green-950 dark:text-green-400">Total: {totalKg.toFixed(2)} kg ({rows.length})</span>}
      refreshing={refreshing}
    >
      <ListCommandToolbar mode={LIST.selectionMode} count={selection.selectedCount} />
      <ListCreatePanel open={adding} title="Record weighing">
        <WeighingForm
          {...createOptions}
          action={mutationAction(createWeighing, { onSuccess: () => setAdding(false) })}
          onCancel={() => setAdding(false)}
        />
      </ListCreatePanel>
      <ListSearchPanel columns={LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
            {COLUMNS.map((column) => <th key={column.key} className={`px-4 py-3 ${column.key === "weightKg" ? "text-right" : ""}`}>{column.sortable ? <SortButton col={column} controls={controls} /> : column.label}</th>)}
          </tr></thead>
          <tbody>
            {visibleRows.map((weighing) => <tr key={weighing.id} {...selection.rowProps(weighing.id)} className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(weighing.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}>
              <td className="px-4 py-3">{new Date(weighing.collectedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="px-4 py-3 font-medium">{weighing.supplierName}</td>
              <td className="px-4 py-3">{weighing.collectorName}</td>
              <td className="px-4 py-3 text-right tabular-nums">{weighing.weightKg.toFixed(2)}</td>
              <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{weighing.notes ?? ""}</td>
            </tr>)}
            {visibleRows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-400">{rows.length ? "No weighings match these filters." : "No weighings found."}</td></tr>}
          </tbody>
        </table>
      </div>
    </ListSurface>
  );
}
