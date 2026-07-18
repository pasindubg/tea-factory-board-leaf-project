"use client";

import Link from "next/link";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";

type ImportRow = {
  id: string;
  source_filename: string | null;
  status: string;
  parsed_at: string | null;
  sale_id: string | null;
};

const BASE_COLUMNS: EntityListColumn<ImportRow>[] = [
  { key: "source_filename", label: "File", accessor: (row) => row.source_filename ?? "document.pdf", sortable: true, filter: "text" },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select", render: (row) => <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-400">{row.status}</span> },
  { key: "parsed_at", label: "Uploaded", accessor: (row) => row.parsed_at, sortable: true, searchInput: "date", cellClassName: "text-stone-500 dark:text-stone-400", render: (row) => row.parsed_at ? new Date(row.parsed_at).toLocaleString() : "—" },
];

export function DocumentImportList({
  title,
  description,
  action,
  rows,
  reviewType,
  accept = "application/pdf",
}: {
  title: string;
  description: string;
  action: (formData: FormData) => void | Promise<void>;
  rows: ImportRow[];
  reviewType: "ack" | "valuation" | "contract" | "bank";
  accept?: string;
}) {
  const columns: EntityListColumn<ImportRow>[] = [
    ...BASE_COLUMNS,
    {
      key: "sale_id",
      label: "Record",
      accessor: (row) => row.sale_id,
      sortable: true,
      filter: "text",
      render: (row) => {
        const href = row.sale_id
          ? `/dashboard/auction/${row.sale_id}/${reviewType}/${row.id}`
          : `/dashboard/auction/${row.id}`;
        return <Link href={href} className="text-green-700 hover:underline dark:text-green-400">Review</Link>;
      },
    },
  ];
  const definition = { columns, selectionMode: "single", add: true } satisfies ListDefinition<ImportRow>;

  return (
    <EntityList
      scope={`document-import-${reviewType}`}
      initialRows={rows}
      definition={definition}
      getId={(row) => row.id}
      rowLabel={(row) => row.source_filename ?? "document.pdf"}
      title={title}
      description={description}
      create={{
        label: "Upload document",
        panelTitle: `Upload ${title.toLowerCase()}`,
        disabledReason: "Finish the current upload first.",
        action: async (formData) => {
          await action(formData);
          return { ok: true, notice: "Document uploaded." };
        },
        render: ({ action: submit, close }) => (
          <form action={submit} className="flex flex-wrap items-center gap-3">
            <input type="file" name="file" accept={accept} required className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-green-700 file:px-3 file:py-1.5 file:text-white hover:file:bg-green-800" />
            <SubmitButton pendingText="Reading…" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600">Upload &amp; review</SubmitButton>
            <button type="button" onClick={close} className="rounded-md border border-stone-300 px-4 py-2 text-sm dark:border-stone-600">Cancel</button>
          </form>
        ),
      }}
      emptyMessage="No documents uploaded yet."
      filteredEmptyMessage="No documents match these filters."
    />
  );
}
