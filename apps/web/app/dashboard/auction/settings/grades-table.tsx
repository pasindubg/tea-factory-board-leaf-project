"use client";

import { useState } from "react";
import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";
import { updateAuctionGrade } from "../actions";

export type GradeTableRow = { id: string; code: string; name: string; active: boolean; sortOrder: number; aliases: string[] };

const COLUMNS: ColumnDef<GradeTableRow>[] = [
  { key: "code", label: "Code", accessor: (r) => r.code, sortable: true, filter: "text" },
  { key: "name", label: "Name", accessor: (r) => r.name, sortable: true, filter: "text" },
  { key: "aliases", label: "Aliases", accessor: (r) => r.aliases.join(" "), sortable: false, filter: "text" },
  { key: "sortOrder", label: "Sort", accessor: (r) => r.sortOrder, sortable: true },
  { key: "active", label: "State", accessor: (r) => (r.active ? "Active" : "Inactive"), sortable: true, filter: "select", filterOptions: [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }] },
];

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";

export function GradesTable({ rows, isOwner }: { rows: GradeTableRow[]; isOwner: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
          <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${col.key === "sortOrder" ? "text-right" : ""}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
            {isOwner && <th className="px-4 py-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((grade) => {
            const isEditing = editingId === grade.id;
            const formId = `grade-${grade.id}`;
            return (
              <tr key={grade.id} className="border-b border-stone-100 align-top last:border-0 dark:border-stone-800">
                <td className="px-4 py-3 font-medium">
                  {isEditing ? (
                    <>
                      <form id={formId} action={updateAuctionGrade.bind(null, grade.id)} />
                      <input form={formId} name="code" required defaultValue={grade.code} className={input} />
                    </>
                  ) : grade.code}
                </td>
                <td className="px-4 py-3">
                  {isEditing ? <input form={formId} name="name" defaultValue={grade.name} className={input} /> : grade.name}
                </td>
                <td className="px-4 py-3">
                  {isEditing ? (
                    <input form={formId} name="aliases" defaultValue={grade.aliases.join(", ")} placeholder="PEK, PEKOE" className={input} />
                  ) : grade.aliases.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {grade.aliases.map((alias) => (
                        <span key={alias} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                          {alias}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-stone-400 dark:text-stone-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {isEditing ? (
                    <input form={formId} name="sort_order" type="number" step="1" min="0" defaultValue={grade.sortOrder} className={`${input} text-right`} />
                  ) : grade.sortOrder}
                </td>
                <td className="px-4 py-3">
                  {isEditing ? (
                    <label className="inline-flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                      <input form={formId} name="active" type="checkbox" defaultChecked={grade.active} className="rounded border-stone-300" />
                      Active
                    </label>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${grade.active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
                      {grade.active ? "Active" : "Inactive"}
                    </span>
                  )}
                </td>
                {isOwner && (
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditingId(null)} className="rounded-md border border-stone-300 px-2 py-1 text-xs dark:border-stone-600">
                          Cancel
                        </button>
                        <button form={formId} className="rounded-md bg-green-700 px-2 py-1 text-xs font-medium text-white dark:bg-green-600">
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <button type="button" onClick={() => setEditingId(grade.id)} className="rounded-md border border-stone-300 px-2 py-1 text-xs dark:border-stone-600">
                          Edit
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={isOwner ? 6 : 5} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No grades match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={isOwner ? 6 : 5} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No grades yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
