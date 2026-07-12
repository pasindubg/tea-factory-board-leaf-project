"use client";

import { useState } from "react";
import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";
import { deleteBroker, updateBroker } from "../actions";
import { ConfirmSubmitButton } from "@/components/confirmation-dialog";

export type BrokerRow = { id: string; name: string; vat_no: string | null; address: string | null };

const COLUMNS: ColumnDef<BrokerRow>[] = [
  { key: "name", label: "Name", accessor: (r) => r.name, sortable: true, filter: "text" },
  { key: "vat_no", label: "VAT no.", accessor: (r) => r.vat_no ?? null, sortable: true, filter: "text" },
  { key: "address", label: "Address", accessor: (r) => r.address ?? null, sortable: true, filter: "text" },
];

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";

export function BrokersTable({ rows, isOwner }: { rows: BrokerRow[]; isOwner: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      <ListSearchPanel columns={COLUMNS} controls={controls} />
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
          {visibleRows.map((b) => {
            const isEditing = editingId === b.id;
            const formId = `broker-${b.id}`;
            return (
              <tr key={b.id} className="border-b border-stone-100 align-top last:border-0 dark:border-stone-800">
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
                        <button type="button" onClick={() => setEditingId(b.id)} className="rounded-md border border-stone-300 px-2 py-1 text-xs dark:border-stone-600">
                          Edit
                        </button>
                        <form action={deleteBroker.bind(null, b.id)}>
                          <ConfirmSubmitButton title="Delete broker?" description="This broker will be permanently removed. This cannot be undone." className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950">
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
              <td colSpan={isOwner ? 4 : 3} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No brokers match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={isOwner ? 4 : 3} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No brokers yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
