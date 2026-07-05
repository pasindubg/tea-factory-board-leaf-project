"use client";

import { SubmitButton } from "@/components/submit-button";
import { saveBrokerGradeThreshold } from "../actions";
import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";

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

export function ThresholdsTable({ rows, isOwner }: { rows: ThresholdTableRow[]; isOwner: boolean }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-3 py-3 ${col.key === "minNetKg" ? "text-right" : ""}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
            <th className="px-3 py-3 text-right"></th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const formId = `threshold-${row.brokerId}-${row.gradeId}`;
            return (
              <tr key={row.key} className="border-b border-stone-100 last:border-0 dark:border-stone-800">
                <td className="px-3 py-3 font-medium">{row.brokerName}</td>
                <td className="px-3 py-3">{row.gradeCode}</td>
                <td className="px-3 py-3 text-right">
                  {isOwner ? (
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
                  {isOwner ? (
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
                <td className="px-3 py-3 text-right">
                  {isOwner && (
                    <form id={formId} action={saveBrokerGradeThreshold} className="inline-block">
                      <input type="hidden" name="broker_id" value={row.brokerId} />
                      <input type="hidden" name="grade_id" value={row.gradeId} />
                      <SubmitButton
                        pendingText="Saving..."
                        className="h-8 rounded-md bg-green-700 px-3 text-xs font-semibold text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700"
                      >
                        Save
                      </SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No thresholds match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">
                Add brokers and active grades before configuring thresholds.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
