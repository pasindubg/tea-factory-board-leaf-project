"use client";

import { useState } from "react";
import { ListCommandToolbar, ListCreatePanel, ListSearchPanel, ListSurface, SortButton, useListControls, useListSelection, type ColumnDef, type ListDefinition } from "@/components/list-controls";
import { createBroker, deleteBroker, updateBroker } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirmation-dialog";

export type BrokerRow = { id: string; name: string; vat_no: string | null; address: string | null };

const COLUMNS: ColumnDef<BrokerRow>[] = [
  { key: "name", label: "Name", accessor: (r) => r.name, sortable: true, filter: "text" },
  { key: "vat_no", label: "VAT no.", accessor: (r) => r.vat_no ?? null, sortable: true, filter: "text" },
  { key: "address", label: "Address", accessor: (r) => r.address ?? null, sortable: true, filter: "text" },
];
const LIST: ListDefinition<BrokerRow> = { columns: COLUMNS, selectionMode: "single", add: true, edit: true, delete: true };

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";

export function BrokersTable({ rows, isOwner }: { rows: BrokerRow[]; isOwner: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const controls = useListControls(rows, LIST.columns);
  const selection = useListSelection(rows, { mode: LIST.selectionMode ?? "single", getId: (row) => row.id });
  const visibleRows = controls.rows;

  return (
    <ListSurface>
      <ListCommandToolbar mode={LIST.selectionMode ?? "single"} count={selection.selectedCount} enableAdd={isOwner && Boolean(LIST.add)} onAdd={{ label: "Add broker", onClick: () => setAdding((value) => !value), disabled: Boolean(editingId) }} enableEdit={isOwner && Boolean(LIST.edit)} onEdit={{ onClick: () => setEditingId(selection.selectedId), disabled: !selection.selectedId || Boolean(editingId) }} enableDelete={isOwner && Boolean(LIST.delete)} onDelete={{ onClick: () => document.getElementById(`delete-broker-${selection.selectedId}`)?.click(), disabled: !selection.selectedId || Boolean(editingId) }}>
        {editingId && <><button type="button" onClick={() => setEditingId(null)} className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold dark:border-stone-600">Cancel</button><button form={`broker-${editingId}`} className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">Save</button></>}
      </ListCommandToolbar>
      <ListCreatePanel open={adding} title="Add broker"><form action={createBroker} className="grid gap-3 sm:grid-cols-3"><input name="name" required placeholder="BPML Produce Marketing" className={input} /><input name="vat_no" placeholder="VAT no." className={input} /><div className="flex gap-2"><input name="address" placeholder="Address" className={input} /><SubmitButton pendingText="Adding…" className="shrink-0 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">Add</SubmitButton></div></form></ListCreatePanel>
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
          {visibleRows.map((b) => {
            const isEditing = editingId === b.id;
            const formId = `broker-${b.id}`;
            return (
              <tr key={b.id} {...selection.rowProps(b.id, isEditing)} className={`cursor-pointer border-b border-stone-100 align-top last:border-0 dark:border-stone-800 ${selection.isSelected(b.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}>
                <td className="px-4 py-3 font-medium">
                  {isEditing ? (
                    <>
                      <form id={formId} action={updateBroker.bind(null, b.id)} />
                      <input form={formId} name="name" required defaultValue={b.name} className={input} />
                    </>
                  ) : b.name}
                </td>
                <td className="px-4 py-3">
                  {isEditing ? <input form={formId} name="vat_no" defaultValue={b.vat_no ?? ""} className={input} /> : b.vat_no ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {isEditing ? <input form={formId} name="address" defaultValue={b.address ?? ""} className={input} /> : b.address ?? "—"}
                </td>
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No brokers match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No brokers yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      <div className="hidden">{rows.map((broker) => <form key={broker.id} action={deleteBroker.bind(null, broker.id)}><ConfirmSubmitButton id={`delete-broker-${broker.id}`} title="Delete broker?" description="This broker will be permanently removed. This cannot be undone.">Delete</ConfirmSubmitButton></form>)}</div>
    </ListSurface>
  );
}
