"use client";

import { useState } from "react";
import { ListCommandToolbar, ListCreatePanel, ListSearchPanel, ListSurface, SortButton, useFrameworkListData, useListControls, useListSelection, type ColumnDef, type ListDefinition } from "@/components/list-controls";
import { createMark, deleteMark, updateMark } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

export type MarkRow = { id: string; code: string; name: string; address: string | null };

const COLUMNS: ColumnDef<MarkRow>[] = [
  { key: "code", label: "Code", accessor: (r) => r.code, sortable: true, filter: "text" },
  { key: "name", label: "Name", accessor: (r) => r.name, sortable: true, filter: "text" },
  { key: "address", label: "Address", accessor: (r) => r.address ?? null, sortable: true, filter: "text" },
];
const LIST: ListDefinition<MarkRow> = { columns: COLUMNS, selectionMode: "single", add: true, edit: true, delete: true };

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";

export function MarksTable({ rows: initialRows, isOwner }: { rows: MarkRow[]; isOwner: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { rows, refreshing, mutate, mutationAction } = useFrameworkListData({ initialRows, resource: { key: "auction.marks" } });
  const controls = useListControls(rows, LIST.columns);
  const selection = useListSelection(rows, { mode: LIST.selectionMode ?? "single", getId: (row) => row.id });
  const visibleRows = controls.rows;

  return (
    <ListSurface
      title="Marks"
      onCreate={() => setAdding(true)}
      canCreate={isOwner && !editingId && !adding}
      createDisabledReason={isOwner ? "Finish editing the current mark first." : "Only the owner can add marks."}
      createLabel="New mark"
      refreshing={refreshing}
    >
      <ListCommandToolbar
        mode={LIST.selectionMode ?? "single"}
        count={selection.selectedCount}
        enableEdit={isOwner && Boolean(LIST.edit)}
        onEdit={{ onClick: () => setEditingId(selection.selectedId), disabled: !selection.selectedId || Boolean(editingId) || adding }}
        enableDelete={isOwner && Boolean(LIST.delete)}
        onDelete={{ onClick: () => setConfirmingDelete(true), disabled: !selection.selectedId || Boolean(editingId) || adding || deleting }}
      >
        {editingId && <><button type="button" onClick={() => setEditingId(null)} className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold dark:border-stone-600">Cancel</button><button form={`mark-${editingId}`} className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">Save</button></>}
      </ListCommandToolbar>
      <ListCreatePanel open={adding} title="Add estate mark"><form action={mutationAction(createMark, { onSuccess: () => setAdding(false) })} className="grid gap-3 sm:grid-cols-3"><input name="code" required placeholder="MF1530" className={input} /><input name="name" required placeholder="KUMUDU" className={input} /><div className="flex gap-2"><input name="address" placeholder="Address" className={input} /><SubmitButton pendingText="Adding…" className="shrink-0 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">Add</SubmitButton></div></form></ListCreatePanel>
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
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((m) => {
            const isEditing = editingId === m.id;
            const formId = `mark-${m.id}`;
            return (
              <tr key={m.id} {...selection.rowProps(m.id, isEditing)} className={`cursor-pointer border-b border-stone-100 align-top last:border-0 dark:border-stone-800 ${selection.isSelected(m.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}>
                <td className="px-4 py-3 font-medium">
                  {isEditing ? (
                    <>
                      <form id={formId} action={mutationAction(updateMark.bind(null, m.id), { onSuccess: () => setEditingId(null) })} />
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
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No marks match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No marks yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      <ConfirmationDialog
        open={confirmingDelete}
        title="Delete mark?"
        description="This mark will be permanently removed. If another record uses it, deletion will be blocked with the dependent record type."
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          if (!selection.selectedId) return;
          setDeleting(true);
          const deleted = await mutate(() => deleteMark(selection.selectedId!), { onSuccess: selection.clear });
          setDeleting(false);
          if (deleted) setConfirmingDelete(false);
        }}
      />
    </ListSurface>
  );
}
