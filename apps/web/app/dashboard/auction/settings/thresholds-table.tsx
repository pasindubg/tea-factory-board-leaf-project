"use client";

import { useState } from "react";
import { saveBrokerGradeThreshold } from "../actions";
import { ListCommandToolbar, ListSearchPanel, ListSurface, SortButton, useFrameworkListData, useListControls, useListSelection, type ColumnDef, type ListDefinition } from "@/components/list-controls";

export type ThresholdTableRow = {
  key: string;
  brokerId: string;
  brokerName: string;
  gradeId: string;
  gradeCode: string;
  minNetKg: number;
  applies: boolean;
};

const COLUMNS: ColumnDef<ThresholdTableRow>[] = [
  { key: "brokerName", label: "Broker", accessor: (r) => r.brokerName, sortable: true, filter: "select" },
  { key: "gradeCode", label: "Grade", accessor: (r) => r.gradeCode, sortable: true, filter: "select" },
  { key: "minNetKg", label: "Min net kg", accessor: (r) => r.minNetKg, sortable: true },
  { key: "applies", label: "Apply", accessor: (r) => (r.applies ? "Applied" : "Not applied"), sortable: true, filter: "select", filterOptions: [{ value: "Applied", label: "Applied" }, { value: "Not applied", label: "Not applied" }] },
];
const LIST: ListDefinition<ThresholdTableRow> = { columns: COLUMNS, selectionMode: "single", add: false, edit: true, delete: false };

export function ThresholdsTable({ rows: initialRows, isOwner }: { rows: ThresholdTableRow[]; isOwner: boolean }) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const { rows, refreshing, mutationAction } = useFrameworkListData({ initialRows, resource: { key: "auction.broker-grade-thresholds" } });
  const controls = useListControls(rows, LIST.columns);
  const selection = useListSelection(rows, { mode: LIST.selectionMode ?? "single", getId: (row) => row.key });
  const visibleRows = controls.rows;
  const editing = rows.find((row) => row.key === editingKey) ?? null;

  return (
    <ListSurface
      title="Broker min-kg shutout thresholds"
      description="Applied thresholds mark factory-entered lots as shutout immediately when net kg is below the broker and grade rule."
      refreshing={refreshing}
    >
      <ListCommandToolbar
        mode={LIST.selectionMode ?? "single"}
        count={selection.selectedCount}
        enableEdit={isOwner && Boolean(LIST.edit)}
        onEdit={{ onClick: () => setEditingKey(selection.selectedId), disabled: !selection.selectedId || Boolean(editingKey) }}
      >
        {editing && <><button type="button" onClick={() => setEditingKey(null)} className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold dark:border-stone-600">Cancel</button><button form={`threshold-${editing.brokerId}-${editing.gradeId}`} className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">Save</button></>}
      </ListCommandToolbar>
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-3 py-3 ${col.key === "minNetKg" ? "text-right" : ""}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const formId = `threshold-${row.brokerId}-${row.gradeId}`;
            const isEditing = editingKey === row.key;
            return (
              <tr key={row.key} {...selection.rowProps(row.key, isEditing)} className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(row.key) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}>
                <td className="px-3 py-3 font-medium">{isEditing && <form id={formId} action={mutationAction(saveBrokerGradeThreshold, { onSuccess: () => setEditingKey(null) })}><input type="hidden" name="broker_id" value={row.brokerId} /><input type="hidden" name="grade_id" value={row.gradeId} /></form>}{row.brokerName}</td>
                <td className="px-3 py-3">{row.gradeCode}</td>
                <td className="px-3 py-3 text-right">
                  {isOwner && isEditing ? (
                    <input
                      form={formId}
                      name="min_net_kg"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={row.minNetKg.toFixed(2)}
                      className="h-8 w-28 rounded-md border border-stone-300 bg-white px-2 text-right text-sm dark:border-stone-600 dark:bg-stone-900"
                    />
                  ) : (
                    <span className="tabular-nums">{row.minNetKg.toFixed(2)}</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {isOwner && isEditing ? (
                    <input
                      form={formId}
                      name="applies"
                      type="checkbox"
                      defaultChecked={row.applies}
                      className="h-4 w-4 rounded border-stone-300 text-green-700 focus:ring-green-700"
                    />
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${row.applies ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
                      {row.applies ? "Applied" : "Not applied"}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No thresholds match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">
                Add brokers and active grades before configuring thresholds.
              </td>
            </tr>
          )}
        </tbody>
      </table></div>
    </ListSurface>
  );
}
