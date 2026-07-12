"use client";

import { editSelectedCollector, setSelectedCollectorsActive } from "./actions";
import { useListControls, SortButton, ListSearchPanel, ListCommandToolbar, ListSelectionCell, ListSelectionHeader, useListSelection, type ColumnDef, type ListSelectionMode } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";

export type CollectorRow = {
  id: string;
  name: string;
  area: string | null;
  phone: string | null;
  nicNumber: string | null;
  active: boolean;
};

const COLUMNS: ColumnDef<CollectorRow>[] = [
  { key: "name", label: "Name", accessor: (r) => r.name, sortable: true, filter: "text", lov: false },
  { key: "area", label: "Area", accessor: (r) => r.area ?? null, sortable: true, filter: "select" },
  { key: "phone", label: "Phone", accessor: (r) => r.phone ?? null, sortable: true, filter: "text", lov: false },
  { key: "nicNumber", label: "NIC", accessor: (r) => r.nicNumber ?? null, sortable: true, filter: "text", lov: false },
  { key: "active", label: "Status", accessor: (r) => (r.active ? "active" : "inactive"), sortable: true, filter: "select", filterOptions: [{ value: "active", label: "active" }, { value: "inactive", label: "inactive" }] },
];
const SELECTION_MODE: ListSelectionMode = "multi";
const CHECKBOX_SCOPE = "collectors";

export function CollectorsTable({ rows }: { rows: CollectorRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;
  const selection = useListSelection(rows, { mode: SELECTION_MODE, getId: (row) => row.id });

  return (
    <form data-selection-mode={SELECTION_MODE} className="overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      <ListCommandToolbar mode={SELECTION_MODE} count={selection.selectedCount}>
          <SubmitButton formAction={editSelectedCollector} pendingText="Opening…" disabled={selection.selectedCount !== 1} className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800">Edit</SubmitButton>
          <SubmitButton formAction={setSelectedCollectorsActive.bind(null, false)} pendingText="…" disabled={selection.selectedCount === 0} className="min-h-10 rounded-full border border-amber-300 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950">Deactivate</SubmitButton>
          <SubmitButton formAction={setSelectedCollectorsActive.bind(null, true)} pendingText="…" disabled={selection.selectedCount === 0} className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-green-500 dark:text-green-950">Reactivate</SubmitButton>
      </ListCommandToolbar>
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            <ListSelectionHeader mode={SELECTION_MODE} scope={CHECKBOX_SCOPE} checked={selection.allVisibleSelected(visibleRows)} onChange={() => selection.toggleVisible(visibleRows)} />
            {COLUMNS.map((col) => (
              <th key={col.key} className="px-4 py-3">
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((c) => (
            <tr key={c.id} {...selection.rowProps(c.id)} className={`cursor-pointer border-b border-stone-100 dark:border-stone-800 last:border-0 ${selection.isSelected(c.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}>
              <ListSelectionCell mode={SELECTION_MODE} scope={CHECKBOX_SCOPE} id={c.id} label={c.name} checked={selection.isSelected(c.id)} onChange={() => selection.toggle(c.id)} />
              <td className="px-4 py-3 font-medium">{c.name}</td>
              <td className="px-4 py-3">{c.area ?? "—"}</td>
              <td className="px-4 py-3">{c.phone ?? "—"}</td>
              <td className="px-4 py-3">{c.nicNumber ?? "—"}</td>
              <td className="px-4 py-3">
                {c.active ? (
                  <span className="rounded-full bg-green-100 dark:bg-green-900 px-2 py-0.5 text-xs text-green-800 dark:text-green-400">active</span>
                ) : (
                  <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs text-stone-500 dark:text-stone-400">inactive</span>
                )}
              </td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No collectors match these filters.
              </td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No collectors yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </form>
  );
}
