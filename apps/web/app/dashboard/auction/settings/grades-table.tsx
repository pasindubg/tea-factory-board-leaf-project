"use client";

import { useState } from "react";
import { ListCommandToolbar, ListCreatePanel, ListSearchPanel, ListSurface, SortButton, useFrameworkListData, useListControls, useListSelection, type ColumnDef, type ListDefinition } from "@/components/list-controls";
import { createAuctionGrade, deleteAuctionGrade, updateAuctionGrade } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

export type GradeTableRow = { id: string; code: string; name: string; active: boolean; sortOrder: number; aliases: string[] };

const COLUMNS: ColumnDef<GradeTableRow>[] = [
  { key: "code", label: "Code", accessor: (r) => r.code, sortable: true, filter: "text" },
  { key: "name", label: "Name", accessor: (r) => r.name, sortable: true, filter: "text" },
  { key: "aliases", label: "Aliases", accessor: (r) => r.aliases.join(" "), sortable: false, filter: "text" },
  { key: "sortOrder", label: "Sort", accessor: (r) => r.sortOrder, sortable: true },
  { key: "active", label: "State", accessor: (r) => (r.active ? "Active" : "Inactive"), sortable: true, filter: "select", filterOptions: [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }] },
];
const LIST: ListDefinition<GradeTableRow> = { columns: COLUMNS, selectionMode: "single", add: true, edit: true, delete: true };

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";

export function GradesTable({ rows: initialRows, isOwner }: { rows: GradeTableRow[]; isOwner: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { rows, refreshing, mutate, mutationAction } = useFrameworkListData({ initialRows, resource: { key: "auction.grades" } });
  const controls = useListControls(rows, LIST.columns);
  const selection = useListSelection(rows, { mode: LIST.selectionMode ?? "single", getId: (row) => row.id });
  const visibleRows = controls.rows;
  const editing = rows.find((row) => row.id === editingId) ?? null;

  return (
    <ListSurface
      title="Tea grades"
      description="Factory grade set used when broker-invoice lots are entered."
      onCreate={() => setAdding(true)}
      canCreate={isOwner && !editingId && !adding}
      createDisabledReason={isOwner ? "Finish the current grade change first." : "Only the factory owner can add grades."}
      createLabel="New grade"
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
        {editing && <><button type="button" onClick={() => setEditingId(null)} className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold dark:border-stone-600">Cancel</button><button form={`grade-${editing.id}`} className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">Save</button></>}
      </ListCommandToolbar>
      <ListCreatePanel open={adding} title="Add tea grade">
        <form action={mutationAction(createAuctionGrade, { onSuccess: () => setAdding(false) })} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input name="code" required placeholder="Code, e.g. OPA" className={input} />
          <input name="name" placeholder="Display name" className={input} />
          <input name="sort_order" type="number" step="1" min="0" placeholder="Sort order" className={input} />
          <div className="flex gap-2">
            <input name="aliases" placeholder="PEK, PEKOE" className={input} />
            <button type="button" onClick={() => setAdding(false)} className="shrink-0 rounded-md border border-stone-300 px-3 py-2 text-sm font-medium dark:border-stone-600">Cancel</button>
            <SubmitButton pendingText="Adding…" className="shrink-0 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700">
              Add
            </SubmitButton>
          </div>
        </form>
      </ListCreatePanel>
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
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((grade) => {
            const isEditing = editingId === grade.id;
            const formId = `grade-${grade.id}`;
            return (
              <tr key={grade.id} {...selection.rowProps(grade.id, isEditing)} className={`cursor-pointer border-b border-stone-100 align-top last:border-0 dark:border-stone-800 ${selection.isSelected(grade.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}>
                <td className="px-4 py-3 font-medium">
                  {isEditing ? (
                    <>
                      <form id={formId} action={mutationAction(updateAuctionGrade.bind(null, grade.id), { onSuccess: () => setEditingId(null) })} />
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
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No grades match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No grades yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      <ConfirmationDialog
        open={confirmingDelete}
        title="Delete grade?"
        description={`Delete ${rows.find((grade) => grade.id === selection.selectedId)?.code ?? "this grade"}, its aliases, and its broker threshold settings? Historical lot grade text is retained.`}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          if (!selection.selectedId) return;
          setDeleting(true);
          const deleted = await mutate(() => deleteAuctionGrade(selection.selectedId!), { onSuccess: selection.clear });
          setDeleting(false);
          if (deleted) setConfirmingDelete(false);
        }}
      />
    </ListSurface>
  );
}
