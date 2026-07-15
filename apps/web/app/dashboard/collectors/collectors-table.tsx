"use client";

import { useState } from "react";
import {
  ListCommandToolbar,
  ListCreatePanel,
  ListSearchPanel,
  ListSelectionCell,
  ListSelectionHeader,
  ListSurface,
  SortButton,
  useFrameworkListData,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import type { CollectorListRow } from "@/lib/list-resources";
import { createCollector, setSelectedCollectorsActive, updateCollector } from "./actions";

export type CollectorRow = CollectorListRow;

const COLUMNS: ColumnDef<CollectorRow>[] = [
  { key: "name", label: "Name", accessor: (row) => row.name, sortable: true, filter: "text", lov: false },
  { key: "area", label: "Area", accessor: (row) => row.area ?? null, sortable: true, filter: "select" },
  { key: "phone", label: "Phone", accessor: (row) => row.phone ?? null, sortable: true, filter: "text", lov: false },
  { key: "nicNumber", label: "NIC", accessor: (row) => row.nicNumber ?? null, sortable: true, filter: "text", lov: false },
  { key: "active", label: "Status", accessor: (row) => row.active ? "active" : "inactive", sortable: true, filter: "select", filterOptions: [{ value: "active", label: "active" }, { value: "inactive", label: "inactive" }] },
];

const LIST = {
  columns: COLUMNS,
  selectionMode: "multi",
  add: true,
  edit: true,
  delete: false,
  commands: [
    { id: "deactivate", label: "Deactivate", requiresSelection: true },
    { id: "activate", label: "Reactivate", requiresSelection: true },
  ],
} satisfies ListDefinition<CollectorRow>;

const input = "w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 focus:border-green-600 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";

export function CollectorsTable({ rows: initialRows }: { rows: CollectorRow[] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { rows, refreshing, mutationAction } = useFrameworkListData({
    initialRows,
    resource: { key: "leaf.collectors" },
  });
  const controls = useListControls(rows, LIST.columns);
  const visibleRows = controls.rows;
  const selection = useListSelection(rows, { mode: LIST.selectionMode, getId: (row) => row.id });
  const selectedId = selection.selectedCount === 1 ? [...selection.selectedIds][0] : null;
  const editing = rows.find((row) => row.id === editingId) ?? null;
  const selectedRows = rows.filter((row) => selection.selectedIds.has(row.id));
  const commandsDisabled = adding || Boolean(editingId) || selection.selectedCount === 0;

  return (
    <ListSurface
      title="Collectors"
      description="Factory collectors and the areas they serve."
      onCreate={() => setAdding(true)}
      canCreate={Boolean(LIST.add) && !adding && !editingId}
      createDisabledReason="Finish the current collector change first."
      createLabel="New collector"
      refreshing={refreshing}
    >
      <ListCommandToolbar
        mode={LIST.selectionMode}
        count={selection.selectedCount}
        enableEdit={Boolean(LIST.edit)}
        onEdit={{
          onClick: () => setEditingId(selectedId),
          disabled: !selectedId || adding || Boolean(editingId),
        }}
      >
        {editing && (
          <>
            <button type="button" onClick={() => setEditingId(null)} className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold dark:border-stone-600">Cancel</button>
            <button type="submit" form={`collector-${editing.id}`} className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-600">Save</button>
          </>
        )}
        <form action={mutationAction(setSelectedCollectorsActive.bind(null, false), { onSuccess: selection.clear })}>
          {[...selection.selectedIds].map((id) => <input key={id} type="hidden" name="selected_ids" value={id} />)}
          <SubmitButton
            pendingText="Deactivating…"
            disabled={commandsDisabled || !selectedRows.some((row) => row.active)}
            className="min-h-10 rounded-full border border-amber-300 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
          >
            {LIST.commands[0].label}
          </SubmitButton>
        </form>
        <form action={mutationAction(setSelectedCollectorsActive.bind(null, true), { onSuccess: selection.clear })}>
          {[...selection.selectedIds].map((id) => <input key={id} type="hidden" name="selected_ids" value={id} />)}
          <SubmitButton
            pendingText="Reactivating…"
            disabled={commandsDisabled || !selectedRows.some((row) => !row.active)}
            className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-green-500 dark:text-green-950"
          >
            {LIST.commands[1].label}
          </SubmitButton>
        </form>
      </ListCommandToolbar>

      <ListCreatePanel open={adding} title="Add collector">
        <form action={mutationAction(createCollector, { onSuccess: () => setAdding(false) })} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Name *"><input name="name" required className={input} /></Field>
          <Field label="Phone"><input name="phone" className={input} /></Field>
          <Field label="NIC number"><input name="nic_number" className={input} /></Field>
          <Field label="Area"><input name="area" className={input} /></Field>
          <div className="flex items-center justify-end gap-2 sm:col-span-2 xl:col-span-4">
            <button type="button" onClick={() => setAdding(false)} className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium dark:border-stone-600">Cancel</button>
            <SubmitButton pendingText="Adding…" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600">Add collector</SubmitButton>
          </div>
        </form>
      </ListCreatePanel>

      <ListSearchPanel columns={LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              <ListSelectionHeader
                mode={LIST.selectionMode}
                scope="collectors"
                checked={selection.allVisibleSelected(visibleRows)}
                onChange={() => selection.toggleVisible(visibleRows)}
                disabled={adding || Boolean(editingId)}
              />
              {LIST.columns.map((column) => <th key={column.key} className="px-4 py-3">{column.sortable ? <SortButton col={column} controls={controls} /> : column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((collector) => {
              const isEditing = editingId === collector.id;
              const formId = `collector-${collector.id}`;
              return (
                <tr
                  key={collector.id}
                  {...selection.rowProps(collector.id, adding || Boolean(editingId))}
                  className={`cursor-pointer border-b border-stone-100 align-top last:border-0 dark:border-stone-800 ${selection.isSelected(collector.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
                >
                  <ListSelectionCell
                    mode={LIST.selectionMode}
                    scope="collectors"
                    id={collector.id}
                    label={collector.name}
                    checked={selection.isSelected(collector.id)}
                    onChange={() => selection.toggle(collector.id)}
                    disabled={adding || Boolean(editingId)}
                  />
                  <td className="px-4 py-3 font-medium">
                    {isEditing ? (
                      <>
                        <form
                          id={formId}
                          action={mutationAction(updateCollector.bind(null, collector.id), {
                            onSuccess: () => {
                              setEditingId(null);
                              selection.clear();
                            },
                          })}
                        />
                        <input form={formId} name="name" aria-label="Collector name" required defaultValue={collector.name} className={input} />
                      </>
                    ) : collector.name}
                  </td>
                  <td className="px-4 py-3">{isEditing ? <input form={formId} name="area" aria-label="Area" defaultValue={collector.area ?? ""} className={input} /> : collector.area ?? "—"}</td>
                  <td className="px-4 py-3">{isEditing ? <input form={formId} name="phone" aria-label="Phone" defaultValue={collector.phone ?? ""} className={input} /> : collector.phone ?? "—"}</td>
                  <td className="px-4 py-3">{isEditing ? <input form={formId} name="nic_number" aria-label="NIC number" defaultValue={collector.nicNumber ?? ""} className={input} /> : collector.nicNumber ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${collector.active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400" : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"}`}>
                      {collector.active ? "active" : "inactive"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && rows.length > 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No collectors match these filters.</td></tr>}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No collectors yet. Use New collector to add the first one.</td></tr>}
          </tbody>
        </table>
      </div>
    </ListSurface>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-sm font-medium text-stone-700 dark:text-stone-300"><span className="mb-1 block">{label}</span>{children}</label>;
}
