"use client";

import { SubmitButton } from "@/components/submit-button";
import { setSupplierActive } from "./actions";
import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";

export type SupplierRow = {
  id: string;
  name: string;
  area: string | null;
  phone: string | null;
  collectorName: string;
  landSizeAcres: number | string | null;
  active: boolean;
};

const COLUMNS: ColumnDef<SupplierRow>[] = [
  { key: "name", label: "Name", accessor: (r) => r.name, sortable: true, filter: "text" },
  { key: "area", label: "Area", accessor: (r) => r.area ?? null, sortable: true, filter: "select" },
  { key: "phone", label: "Phone", accessor: (r) => r.phone ?? null, sortable: true, filter: "text" },
  { key: "collectorName", label: "Collector", accessor: (r) => r.collectorName, sortable: true, filter: "select" },
  { key: "landSizeAcres", label: "Land (acres)", accessor: (r) => (r.landSizeAcres != null ? Number(r.landSizeAcres) : null), sortable: true },
  { key: "active", label: "Status", accessor: (r) => (r.active ? "active" : "inactive"), sortable: true, filter: "select", filterOptions: [{ value: "active", label: "active" }, { value: "inactive", label: "inactive" }] },
];

export function SuppliersTable({ rows }: { rows: SupplierRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className="px-4 py-3">
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((s) => (
            <tr key={s.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
              <td className="px-4 py-3 font-medium">{s.name}</td>
              <td className="px-4 py-3">{s.area ?? "—"}</td>
              <td className="px-4 py-3">{s.phone ?? "—"}</td>
              <td className="px-4 py-3">{s.collectorName}</td>
              <td className="px-4 py-3">{s.landSizeAcres ?? "—"}</td>
              <td className="px-4 py-3">
                {s.active ? (
                  <span className="rounded-full bg-green-100 dark:bg-green-900 px-2 py-0.5 text-xs text-green-800 dark:text-green-400">active</span>
                ) : (
                  <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs text-stone-500 dark:text-stone-400">inactive</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <a href={`/dashboard/suppliers/${s.id}/edit`} className="text-green-700 dark:text-green-400 hover:underline">
                    Edit
                  </a>
                  <form action={setSupplierActive.bind(null, s.id, !s.active)}>
                    <SubmitButton pendingText="…" className="text-stone-500 dark:text-stone-400 hover:underline">
                      {s.active ? "Deactivate" : "Reactivate"}
                    </SubmitButton>
                  </form>
                </div>
              </td>
            </tr>
          ))}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No suppliers match these filters.
              </td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No suppliers yet. Add your first supplier to get started.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
