"use client";

import { DetailSideList } from "@/components/detail-side-list";
import type { ColumnDef } from "@/components/list-controls";
import type { AuctionDocumentSideListRow } from "@/lib/list-resources";

export type DocumentSideListRow = AuctionDocumentSideListRow;

const STATUS_STYLE: Record<DocumentSideListRow["status"], string> = {
  valid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400",
  issue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-400",
};

const COLUMNS: ColumnDef<DocumentSideListRow>[] = [
  { key: "docTypeLabel", label: "Document type", accessor: (row) => row.docTypeLabel, sortable: true, filter: "select" },
  { key: "filename", label: "File", accessor: (row) => row.filename, sortable: true, filter: "text" },
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select" },
  { key: "saleNo", label: "Sale", accessor: (row) => row.saleNo, sortable: true, filter: "text" },
  { key: "statusLabel", label: "Status", accessor: (row) => row.statusLabel, sortable: true, filter: "select" },
  { key: "uploadedAt", label: "Uploaded", accessor: (row) => row.uploadedAt, sortable: true, searchInput: "date", lov: false },
];

export function DocumentsSideList({
  rows,
  currentDocumentId,
  searchPanelId,
}: {
  rows: DocumentSideListRow[];
  currentDocumentId: string;
  searchPanelId: string;
}) {
  return (
    <DetailSideList
      resource={{ key: "auction.documents-side-list" }}
      initialRows={rows}
      columns={COLUMNS}
      getId={(row) => row.id}
      rowLabel={(row) => `${row.docTypeLabel} — ${row.filename}`}
      searchPanelId={searchPanelId}
      emptyMessage="No documents have been uploaded yet."
      filteredEmptyMessage="No documents match these filters."
      sideList={{
        href: (doc) => `/dashboard/auction/documents/${doc.id}`,
        isActive: (doc) => doc.id === currentDocumentId,
        sortColumnKey: "uploadedAt",
        searchLabel: "Search",
        showSelectionSummary: false,
        content: (doc, { active }) => (
          <>
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-green-700 dark:text-green-400">{doc.docTypeLabel}</span>
              {active && <span className="text-stone-400">‹</span>}
            </div>
            <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{doc.filename}</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-stone-500 dark:text-stone-400">{doc.broker} · Sale {doc.saleNo}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 ${STATUS_STYLE[doc.status]}`}>{doc.statusLabel}</span>
            </div>
          </>
        ),
      }}
    />
  );
}
