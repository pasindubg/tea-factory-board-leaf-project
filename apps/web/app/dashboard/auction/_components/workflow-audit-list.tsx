"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";

export type WorkflowAuditRow = {
  action: string;
  detail: string;
  reason: string | null;
  actor: string;
  confidenceShown: number | null;
  createdAt: string;
};

type AuditListRow = WorkflowAuditRow & { id: string };

const COLUMNS: EntityListColumn<AuditListRow>[] = [
  { key: "action", label: "Action", accessor: (row) => row.action, sortable: true, filter: "select", cellClassName: "whitespace-nowrap font-medium text-stone-800 dark:text-stone-100" },
  { key: "detail", label: "Detail", accessor: (row) => row.detail, sortable: true, filter: "text", lov: false, cellClassName: "min-w-64 text-stone-600 dark:text-stone-300" },
  { key: "reason", label: "Reason", accessor: (row) => row.reason, sortable: true, filter: "text", lov: false, cellClassName: "min-w-48 text-stone-500 dark:text-stone-400", render: (row) => row.reason ?? "—" },
  { key: "confidence", label: "Confidence shown", accessor: (row) => row.confidenceShown == null ? null : Math.round(row.confidenceShown * 100), sortable: true, lov: false, searchInput: "number", cellClassName: "whitespace-nowrap tabular-nums", render: (row) => row.confidenceShown == null ? "—" : `${Math.round(row.confidenceShown * 100)}%` },
  { key: "actor", label: "Actor", accessor: (row) => row.actor, sortable: true, filter: "select", cellClassName: "whitespace-nowrap" },
  { key: "createdAt", label: "Recorded", accessor: (row) => row.createdAt, sortable: true, searchInput: "date", cellClassName: "whitespace-nowrap text-xs text-stone-500 dark:text-stone-400", render: (row) => new Date(row.createdAt).toLocaleString() },
];

const LIST: ListDefinition<AuditListRow> = { columns: COLUMNS, selectionMode: "single" };

export function WorkflowAuditList({
  rows,
  title = "Decision audit",
  description = "Select and search recorded workflow decisions.",
}: {
  rows: WorkflowAuditRow[];
  title?: string;
  description?: string;
}) {
  const listRows = rows.map((row, index) => ({ ...row, id: `${row.createdAt}:${row.action}:${index}` }));
  return (
    <EntityList
      scope="workflow-audit"
      initialRows={listRows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.action}
      title={title}
      description={description}
      emptyMessage="No decisions recorded yet."
      filteredEmptyMessage="No audit entries match the current search."
    />
  );
}
