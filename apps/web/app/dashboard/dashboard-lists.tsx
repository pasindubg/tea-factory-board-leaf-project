"use client";

import Link from "next/link";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";

export type CollectorIntakeRow = { id: string; name: string; kg: number };
export type RecentWeighingRow = { id: string; supplier: string; collector: string; collectedAt: string; weightKg: number };

const COLLECTOR_COLUMNS: EntityListColumn<CollectorIntakeRow>[] = [
  { key: "name", label: "Collector", accessor: (row) => row.name, sortable: true, filter: "select", cellClassName: "font-medium" },
  { key: "kg", label: "Intake kg", accessor: (row) => row.kg, sortable: true, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => `${row.kg.toFixed(2)} kg` },
];

const RECENT_COLUMNS: EntityListColumn<RecentWeighingRow>[] = [
  { key: "supplier", label: "Supplier", accessor: (row) => row.supplier, sortable: true, filter: "select", cellClassName: "font-medium" },
  { key: "collector", label: "Collector", accessor: (row) => row.collector, sortable: true, filter: "select" },
  { key: "collectedAt", label: "Collected", accessor: (row) => row.collectedAt, sortable: true, searchInput: "date", cellClassName: "text-stone-500 dark:text-stone-400", render: (row) => new Date(row.collectedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) },
  { key: "weightKg", label: "Weight kg", accessor: (row) => row.weightKg, sortable: true, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right font-medium tabular-nums", render: (row) => `${row.weightKg.toFixed(2)} kg` },
];

const COLLECTOR_LIST = { columns: COLLECTOR_COLUMNS, selectionMode: "single" } satisfies ListDefinition<CollectorIntakeRow>;
const RECENT_LIST = { columns: RECENT_COLUMNS, selectionMode: "single" } satisfies ListDefinition<RecentWeighingRow>;

export function CollectorIntakeList({ rows }: { rows: CollectorIntakeRow[] }) {
  return (
    <EntityList
      scope="dashboard-collector-intake"
      initialRows={rows}
      definition={COLLECTOR_LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.name}
      title="Today by collector"
      emptyMessage="No intake recorded today."
      filteredEmptyMessage="No collector intake matches these filters."
      className="h-full shadow-none"
    />
  );
}

export function RecentWeighingsList({ rows }: { rows: RecentWeighingRow[] }) {
  return (
    <EntityList
      scope="dashboard-recent-weighings"
      initialRows={rows}
      definition={RECENT_LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `${row.supplier} weighing`}
      title="Recent weighings"
      actions={<Link href="/dashboard/weighings" className="text-sm font-semibold text-green-700 hover:underline dark:text-green-400">View all</Link>}
      emptyMessage="No weighings yet."
      filteredEmptyMessage="No recent weighings match these filters."
    />
  );
}
