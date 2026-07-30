"use client";

import {
  EntityList,
  type EntityListColumn,
  type EntityListCommand,
  type EntityListViewTab,
} from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { AuctionPrefixExceptionListRow } from "@/lib/list-resources";
import { approveInvoicePrefixException, declineInvoicePrefixException } from "../actions";
import { CATEGORY_LABEL, type InvoiceCategory } from "../invoice-number";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function summarizePayload(row: AuctionPrefixExceptionListRow): string {
  const p = row.payload;
  if (row.category === "broker_invoice") {
    return `Broker invoice for sale ${p.target_sale_no ?? "—"}`;
  }
  const invoiceNo = Array.isArray(p.invoice_no) ? (p.invoice_no as string[]).join(", ") : String(p.invoice_no ?? "—");
  return `Lot invoice ${invoiceNo}, grade ${p.grade ?? "—"}`;
}

const COLUMNS: EntityListColumn<AuctionPrefixExceptionListRow>[] = [
  { key: "category", label: "Category", accessor: (row) => CATEGORY_LABEL[row.category as InvoiceCategory] ?? row.category, sortable: true, filter: "select" },
  { key: "requestedPrefix", label: "Requested prefix", accessor: (row) => row.requestedPrefix, sortable: true, filter: "text", cellClassName: "font-mono font-medium" },
  { key: "summary", label: "Entry", accessor: () => null, lov: false, render: (row) => <span className="text-stone-600 dark:text-stone-300">{summarizePayload(row)}</span> },
  { key: "requestedByName", label: "Requested by", accessor: (row) => row.requestedByName ?? "", sortable: true, filter: "select" },
  { key: "requestedAt", label: "Requested", accessor: (row) => row.requestedAt ?? "", sortable: true, render: (row) => formatDate(row.requestedAt) },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select", render: (row) => <StatusBadge status={row.status} /> },
  { key: "note", label: "Note", accessor: (row) => row.note ?? "", filter: "text", render: (row) => row.note || "—" },
];

const LIST_DEFINITION = {
  columns: COLUMNS,
  selectionMode: "single",
  add: false,
  edit: false,
  delete: false,
} satisfies ListDefinition<AuctionPrefixExceptionListRow>;

function decisionCommand(
  id: string,
  label: string,
  action: (formData: FormData) => Promise<ListMutationResult>,
  destructive = false,
): EntityListCommand<AuctionPrefixExceptionListRow> {
  return {
    id,
    label,
    pendingLabel: "Working…",
    destructive,
    disabled: ({ selectedRows }) => selectedRows.length !== 1,
    run: ({ selectedRows }) => {
      const formData = new FormData();
      formData.set("id", selectedRows[0].id);
      return action(formData);
    },
    confirm: destructive
      ? {
          title: "Decline this prefix request?",
          description: "The entry will not be created. This cannot be undone.",
          confirmLabel: "Decline",
        }
      : undefined,
  };
}

const PENDING_COMMANDS: EntityListCommand<AuctionPrefixExceptionListRow>[] = [
  decisionCommand("approve", "Approve", approveInvoicePrefixException),
  decisionCommand("decline", "Decline", declineInvoicePrefixException, true),
];

const TABS: EntityListViewTab<AuctionPrefixExceptionListRow>[] = [
  {
    id: "pending",
    label: "Pending",
    filter: (row) => row.status === "pending",
    title: "Pending prefix requests",
    description: "Someone picked a prefix other than the active one. Approve to create the entry with that prefix, or decline.",
    commands: PENDING_COMMANDS,
    emptyMessage: "No pending prefix requests.",
    filteredEmptyMessage: "No requests match the current search.",
  },
  {
    id: "history",
    label: "History",
    filter: (row) => row.status !== "pending",
    limit: 20,
    title: "Decided requests",
    description: "Approved and declined prefix requests.",
    commands: [],
    emptyMessage: "No decided requests yet.",
    filteredEmptyMessage: "No requests match the current search.",
  },
];

export function ApprovalsTable({ initialRows }: { initialRows: AuctionPrefixExceptionListRow[] }) {
  return (
    <EntityList
      resource={{ key: "auction.prefix-approvals" }}
      initialRows={initialRows}
      definition={LIST_DEFINITION}
      getId={(row) => row.id}
      rowLabel={(row) => `${row.requestedPrefix} request`}
      emptyMessage="No prefix requests."
      tabs={{
        defaultTab: "pending",
        label: "Prefix approval workflow",
        items: TABS,
      }}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    declined: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${styles[status] ?? styles.declined}`}>{status}</span>;
}
