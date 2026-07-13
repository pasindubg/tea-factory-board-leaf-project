"use client";

import { useState } from "react";
import { ListCommandToolbar, ListCreatePanel, ListSearchPanel, ListSurface, SortButton, useListControls, type ColumnDef, type ListDefinition } from "@/components/list-controls";
import { createMark, deleteMark, updateMark } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirmation-dialog";

export type MarkRow = { id: string; code: string; name: string; address: string | null };

const COLUMNS: ColumnDef<MarkRow>[] = [
  { key: "code", label: "Code", accessor: (r) => r.code, sortable: true, filter: "text" },
  { key: "name", label: "Name", accessor: (r) => r.name, sortable: true, filter: "text" },
  { key: "address", label: "Address", accessor: (r) => r.address ?? null, sortable: true, filter: "text" },
];
const LIST: ListDefinition<MarkRow> = { columns: COLUMNS, selectionMode: "single", add: true, edit: true, delete: true };

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";

export function MarksTable({ rows, isOwner }: { rows: MarkRow[]; isOwner: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const controls = useListControls(rows, LIST.columns);
  const visibleRows = controls.rows;

  return (
    <ListSurface>
      <ListCommandToolbar mode="single" enableAdd={isOwner && Boolean(LIST.add)} onAdd={{ label: "Add mark", onClick: () => setAdding((value) => !value), disabled: Boolean(editingId) }} />
      <ListCreatePanel open={adding} title="Add estate mark"><form action={createMark} className="grid gap-3 sm:grid-cols-3"><input name="code" required placeholder="MF1530" className={input} /><input name="name" required placeholder="KUMUDU" className={input} /><div className="flex gap-2"><input name="address" placeholder="Address" className={input} /><SubmitButton pendingText="Adding…" className="shrink-0 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">Add</SubmitButton></div></form></ListCreatePanel>
      <ListSearchPanel columns={LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className="px-4 py-3">
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
            {isOwner && <th className="px-4 py-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((m) => {
            const isEditing = editingId === m.id;
            const formId = `mark-${m.id}`;
            return (
              <tr key={m.id} className="border-b border-stone-100 align-top last:border-0 dark:border-stone-800">
                <td className="px-4 py-3 font-medium">
                  {isEditing ? (
                    <>
                      <form id={formId} action={updateMark.bind(null, m.id)} />
                      <input form={formId} name="code" required defaultValue={m.code} className={input} />
                    </>
                  ) : m.code}
                </td>
                <td className="px-4 py-3">
                  {isEditing ? <input form={formId} name="name" required defaultValue={m.name} className={input} /> : m.name}
                </td>
                <td className="px-4 py-3">
                  {isEditing ? <input form={formId} name="address" defaultValue={m.address ?? ""} className={input} /> : m.address ?? "—"}
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
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditingId(m.id)} className="rounded-md border border-stone-300 px-2 py-1 text-xs dark:border-stone-600">
                          Edit
                        </button>
                        <form action={deleteMark.bind(null, m.id)}>
                          <ConfirmSubmitButton title="Delete mark?" description="This mark will be permanently removed. This cannot be undone." className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950">
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={isOwner ? 4 : 3} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No marks match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={isOwner ? 4 : 3} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No marks yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </ListSurface>
  );
}
