"use client";

import { useState } from "react";
import { ListCommandToolbar, ListCreatePanel, ListSearchPanel, ListSurface, SortButton, useFrameworkListData, useListControls, useListSelection, type ColumnDef, type ListDefinition } from "@/components/list-controls";
import { createAuctionWarehouse, updateAuctionWarehouse } from "../actions";
import { SubmitButton } from "@/components/submit-button";

export type WarehouseTableRow = { id: string; name: string; active: boolean };

const COLUMNS: ColumnDef<WarehouseTableRow>[] = [
  { key: "name", label: "Warehouse", accessor: (row) => row.name, sortable: true, filter: "text" },
  { key: "active", label: "State", accessor: (row) => (row.active ? "Active" : "Inactive"), sortable: true, filter: "select", filterOptions: [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }] },
];
const LIST: ListDefinition<WarehouseTableRow> = { columns: COLUMNS, selectionMode: "single", add: true, edit: true, delete: false };
const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";

export function WarehousesTable({ rows: initialRows, isOwner }: { rows: WarehouseTableRow[]; isOwner: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { rows, refreshing, mutationAction } = useFrameworkListData({ initialRows, resource: { key: "auction.warehouses" } });
  const controls = useListControls(rows, LIST.columns);
  const selection = useListSelection(rows, { mode: LIST.selectionMode ?? "single", getId: (row) => row.id });
  const visibleRows = controls.rows;
  const editing = rows.find((row) => row.id === editingId) ?? null;

  return <ListSurface
    title="Warehouses"
    onCreate={() => setAdding(true)}
    canCreate={Boolean(isOwner && LIST.add) && !editingId}
    createDisabledReason={isOwner ? "Finish editing the current warehouse first." : "Only the owner can add warehouses."}
    createLabel="New warehouse"
    refreshing={refreshing}
  >
    <ListCommandToolbar mode={LIST.selectionMode ?? "single"} count={selection.selectedCount} enableEdit={Boolean(isOwner && LIST.edit)} onEdit={{ label: "Edit", onClick: () => setEditingId(selection.selectedId), disabled: !selection.selectedId || Boolean(editingId) }}>
      {editing && <><button type="button" onClick={() => setEditingId(null)} className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800">Cancel</button><button form={`warehouse-${editing.id}`} className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700">Save changes</button></>}
    </ListCommandToolbar>
    <ListCreatePanel open={adding} title="Add warehouse"><form action={mutationAction(createAuctionWarehouse, { onSuccess: () => setAdding(false) })} className="flex max-w-xl gap-2"><input name="name" required placeholder="Main warehouse" className={input} /><SubmitButton pendingText="Adding…" className="shrink-0 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">Add</SubmitButton></form></ListCreatePanel>
    <ListSearchPanel columns={LIST.columns} controls={controls} />
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">{LIST.columns.map((column) => <th key={column.key} className="px-4 py-3">{column.sortable ? <SortButton col={column} controls={controls} /> : column.label}</th>)}</tr></thead><tbody>
      {visibleRows.map((warehouse) => {
        const rowEditing = editingId === warehouse.id;
        const formId = `warehouse-${warehouse.id}`;
        return <tr key={warehouse.id} {...selection.rowProps(warehouse.id, rowEditing)} className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(warehouse.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}><td className="px-4 py-3">{rowEditing ? <><form id={formId} action={mutationAction(updateAuctionWarehouse.bind(null, warehouse.id), { onSuccess: () => setEditingId(null) })} /><input form={formId} name="name" required defaultValue={warehouse.name} className={input} /></> : warehouse.name}</td><td className="px-4 py-3">{rowEditing ? <label className="inline-flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300"><input form={formId} name="active" type="checkbox" defaultChecked={warehouse.active} className="rounded border-stone-300" />Active</label> : <span className={`rounded-full px-2 py-0.5 text-xs ${warehouse.active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>{warehouse.active ? "Active" : "Inactive"}</span>}</td></tr>;
      })}
      {visibleRows.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">{rows.length === 0 ? "No warehouses yet." : "No warehouses match these filters."}</td></tr>}
    </tbody></table></div>
  </ListSurface>;
}
