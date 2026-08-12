"use client";

import Link from "next/link";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { formatDateTime } from "@/lib/dates";
import type { AuctionDocType, DocumentStatus } from "../../doc-status";

export type SaleDocumentRow = {
  id: string;
  docType: AuctionDocType;
  docTypeLabel: string;
  filename: string;
  broker: string;
  status: DocumentStatus;
  statusLabel: string;
  active: boolean;
  uploadedAt: string | null;
  href: string | null;
};

const STATUS_STYLE: Record<DocumentStatus, string> = {
  valid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400",
  issue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-400",
};

const COLUMNS: EntityListColumn<SaleDocumentRow>[] = [
  {
    key: "docTypeLabel",
    label: "Document type",
    accessor: (row) => row.docTypeLabel,
    sortable: true,
    filter: "select",
    cellClassName: "font-medium",
  },
  {
    key: "filename",
    label: "File",
    accessor: (row) => row.filename,
    sortable: true,
    filter: "text",
    render: (row) =>
      row.href ? (
        <Link href={row.href} className="text-green-700 hover:underline dark:text-green-400">
          {row.filename}
        </Link>
      ) : (
        row.filename
      ),
  },
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select" },
  {
    key: "statusLabel",
    label: "Document status",
    accessor: (row) => row.statusLabel,
    sortable: true,
    filter: "select",
    render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[row.status]}`}>{row.statusLabel}</span>,
  },
  {
    key: "active",
    label: "Active",
    accessor: (row) => (row.active ? "Yes" : "No"),
    sortable: true,
    filter: "select",
    filterOptions: [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }],
    render: (row) => (
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${
          row.active
            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400"
            : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"
        }`}
      >
        {row.active ? "Yes" : "No"}
      </span>
    ),
  },
  {
    key: "uploadedAt",
    label: "Uploaded",
    accessor: (row) => row.uploadedAt,
    sortable: true,
    searchInput: "date",
    lov: false,
    cellClassName: "text-stone-500 dark:text-stone-400",
    render: (row) => formatDateTime(row.uploadedAt),
  },
];

const LIST: ListDefinition<SaleDocumentRow> = { columns: COLUMNS, selectionMode: "single" };

export function SaleDocumentsTable({ rows }: { rows: SaleDocumentRow[] }) {
  return (
    <EntityList
      scope="auction-sale-documents"
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `${row.docTypeLabel} — ${row.filename}`}
      title="Documents"
      emptyMessage="No documents have been uploaded for this sale yet."
      filteredEmptyMessage="No documents match these filters."
    />
  );
}
