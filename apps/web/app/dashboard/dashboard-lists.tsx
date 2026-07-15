"use client";

import Link from "next/link";
import {
  ListCommandToolbar,
  ListSearchPanel,
  ListSurface,
  SortButton,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";

export type CollectorIntakeRow = {
  id: string;
  name: string;
  kg: number;
};

export type RecentWeighingRow = {
  id: string;
  supplier: string;
  collector: string;
  collectedAt: string;
  weightKg: number;
};

const COLLECTOR_COLUMNS: ColumnDef<CollectorIntakeRow>[] = [
  { key: "name", label: "Collector", accessor: (row) => row.name, sortable: true, filter: "select" },
  { key: "kg", label: "Intake kg", accessor: (row) => row.kg, sortable: true, searchInput: "number" },
];

const RECENT_COLUMNS: ColumnDef<RecentWeighingRow>[] = [
  { key: "supplier", label: "Supplier", accessor: (row) => row.supplier, sortable: true, filter: "select" },
  { key: "collector", label: "Collector", accessor: (row) => row.collector, sortable: true, filter: "select" },
  { key: "collectedAt", label: "Collected", accessor: (row) => row.collectedAt, sortable: true, searchInput: "date" },
  { key: "weightKg", label: "Weight kg", accessor: (row) => row.weightKg, sortable: true, searchInput: "number" },
];

const COLLECTOR_LIST = { columns: COLLECTOR_COLUMNS, selectionMode: "single", add: false, edit: false, delete: false } satisfies ListDefinition<CollectorIntakeRow>;
const RECENT_LIST = { columns: RECENT_COLUMNS, selectionMode: "single", add: false, edit: false, delete: false } satisfies ListDefinition<RecentWeighingRow>;

export function CollectorIntakeList({ rows }: { rows: CollectorIntakeRow[] }) {
  const controls = useListControls(rows, COLLECTOR_LIST.columns);
  const selection = useListSelection(rows, { mode: COLLECTOR_LIST.selectionMode, getId: (row) => row.id });

  return (
    <ListSurface title="Today by collector" className="h-full shadow-none">
      <ListCommandToolbar mode={COLLECTOR_LIST.selectionMode} count={selection.selectedCount} />
      <ListSearchPanel columns={COLLECTOR_LIST.columns} controls={controls} label="Search collector intake" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">{COLLECTOR_LIST.columns.map((column) => <th key={column.key} className={column.key === "kg" ? "px-4 py-3 text-right" : "px-4 py-3"}><SortButton col={column} controls={controls} /></th>)}</tr></thead>
          <tbody>
            {controls.rows.map((row) => <tr key={row.id} {...selection.rowProps(row.id)} className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(row.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}><td className="px-4 py-3 font-medium">{row.name}</td><td className="px-4 py-3 text-right tabular-nums">{row.kg.toFixed(2)} kg</td></tr>)}
            {controls.rows.length === 0 && <tr><td colSpan={2} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">{rows.length === 0 ? "No intake recorded today." : "No collector intake matches these filters."}</td></tr>}
          </tbody>
        </table>
      </div>
    </ListSurface>
  );
}

export function RecentWeighingsList({ rows }: { rows: RecentWeighingRow[] }) {
  const controls = useListControls(rows, RECENT_LIST.columns);
  const selection = useListSelection(rows, { mode: RECENT_LIST.selectionMode, getId: (row) => row.id });

  return (
    <ListSurface
      title="Recent weighings"
      actions={<Link href="/dashboard/weighings" className="text-sm font-semibold text-green-700 hover:underline dark:text-green-400">View all</Link>}
    >
      <ListCommandToolbar mode={RECENT_LIST.selectionMode} count={selection.selectedCount} />
      <ListSearchPanel columns={RECENT_LIST.columns} controls={controls} label="Search recent weighings" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">{RECENT_LIST.columns.map((column) => <th key={column.key} className={column.key === "weightKg" ? "px-4 py-3 text-right" : "px-4 py-3"}><SortButton col={column} controls={controls} /></th>)}</tr></thead>
          <tbody>
            {controls.rows.map((row) => <tr key={row.id} {...selection.rowProps(row.id)} className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(row.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}><td className="px-4 py-3 font-medium">{row.supplier}</td><td className="px-4 py-3">{row.collector}</td><td className="px-4 py-3 text-stone-500 dark:text-stone-400">{new Date(row.collectedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{row.weightKg.toFixed(2)} kg</td></tr>)}
            {controls.rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">{rows.length === 0 ? "No weighings yet." : "No recent weighings match these filters."}</td></tr>}
          </tbody>
        </table>
      </div>
    </ListSurface>
  );
}
