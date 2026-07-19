"use client";

import {
  EntityList,
  type EntityListColumn,
  type EntityListCommand,
  type EntityListViewTab,
} from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { SupplierRequestListRow } from "@/lib/list-resources";
import { approveRequest, declineRequest, handToDriver } from "./actions";

type Lane = "pending" | "approved" | "handed" | "history";
type RequestAction = (formData: FormData) => Promise<ListMutationResult>;

function formatAmount(amount: string | null) {
  return amount == null
    ? "—"
    : `LKR ${Number(amount).toLocaleString("en-LK", { minimumFractionDigits: 2 })}`;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

const COLUMNS: EntityListColumn<SupplierRequestListRow>[] = [
  { key: "supplierName", label: "Supplier", accessor: (row) => row.supplierName, sortable: true, filter: "select", cellClassName: "font-medium text-stone-900 dark:text-stone-100" },
  { key: "typeLabel", label: "Request", accessor: (row) => row.typeLabel, sortable: true, filter: "select" },
  { key: "amount", label: "Amount", accessor: (row) => row.amount == null ? null : Number(row.amount), sortable: true, lov: false, searchInput: "number", cellClassName: "whitespace-nowrap font-medium", render: (row) => formatAmount(row.amount) },
  { key: "requestedAt", label: "Requested", accessor: (row) => row.requestedAt, sortable: true, searchInput: "date", cellClassName: "whitespace-nowrap text-xs text-stone-500 dark:text-stone-400", render: (row) => formatDate(row.requestedAt) },
  { key: "handedAt", label: "Handed", accessor: (row) => row.handedAt, sortable: true, searchInput: "date", cellClassName: "whitespace-nowrap text-xs", render: (row) => formatDate(row.handedAt) },
  { key: "note", label: "Note", accessor: (row) => row.note, sortable: true, filter: "text", lov: false, cellClassName: "max-w-sm text-stone-600 dark:text-stone-300", render: (row) => row.note || "—" },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select", render: (row) => <StatusBadge status={row.status} warning={row.status === "handed_to_driver"} /> },
];

const LIST_DEFINITION = {
  columns: COLUMNS,
  selectionMode: "single",
  add: false,
  edit: false,
  delete: false,
} satisfies ListDefinition<SupplierRequestListRow>;

const LANE_COPY: Record<Lane, { title: string; description: string; empty: string }> = {
  pending: {
    title: "Pending requests",
    description: "Select a request, then approve or decline it from the list toolbar.",
    empty: "No pending requests.",
  },
  approved: {
    title: "Approved — to hand over",
    description: "Approved cash or items waiting to be given to the driver.",
    empty: "Nothing approved is awaiting handover.",
  },
  handed: {
    title: "⚠ Handed to driver — awaiting supplier acknowledgement",
    description: "The driver was given these items, but the supplier has not confirmed receipt in the field app. Treat this as an unresolved delivery signal.",
    empty: "No handed requests are awaiting supplier acknowledgement.",
  },
  history: {
    title: "Recent request history",
    description: "Acknowledged, declined, and cancelled requests.",
    empty: "No completed requests yet.",
  },
};

function requestCommand(
  id: string,
  label: string,
  action: RequestAction,
  destructive = false,
): EntityListCommand<SupplierRequestListRow> {
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
          title: "Decline supplier request?",
          description: "The selected request will move to declined history and cannot continue through the approval and handover workflow.",
          confirmLabel: "Decline request",
        }
      : undefined,
  };
}

const LANE_COMMANDS: Record<Lane, EntityListCommand<SupplierRequestListRow>[]> = {
  pending: [
    requestCommand("approve", "Approve", approveRequest),
    requestCommand("decline", "Decline", declineRequest, true),
  ],
  approved: [requestCommand("hand", "Mark handed to driver", handToDriver)],
  handed: [],
  history: [],
};

const REQUEST_TABS: EntityListViewTab<SupplierRequestListRow>[] = [
  {
    id: "pending",
    label: "Pending",
    filter: (row) => row.status === "pending",
    title: LANE_COPY.pending.title,
    description: LANE_COPY.pending.description,
    commands: LANE_COMMANDS.pending,
    emptyMessage: LANE_COPY.pending.empty,
    filteredEmptyMessage: "No requests match the current search.",
  },
  {
    id: "approved",
    label: "Approved",
    filter: (row) => row.status === "approved",
    title: LANE_COPY.approved.title,
    description: LANE_COPY.approved.description,
    commands: LANE_COMMANDS.approved,
    emptyMessage: LANE_COPY.approved.empty,
    filteredEmptyMessage: "No requests match the current search.",
  },
  {
    id: "handed",
    label: "Awaiting acknowledgement",
    filter: (row) => row.status === "handed_to_driver",
    title: LANE_COPY.handed.title,
    description: LANE_COPY.handed.description,
    commands: LANE_COMMANDS.handed,
    emptyMessage: LANE_COPY.handed.empty,
    filteredEmptyMessage: "No requests match the current search.",
    className: "border-amber-300 dark:border-amber-700",
    headerClassName: "bg-amber-50/80 dark:bg-amber-950/30",
    rowClassName: (_row, { selected }) => `border-amber-200 dark:border-amber-900 ${selected ? "bg-amber-100 dark:bg-amber-950/60" : "bg-amber-50/60 dark:bg-amber-950/20"}`,
  },
  {
    id: "history",
    label: "History",
    filter: (row) => ["acknowledged", "declined", "cancelled"].includes(row.status),
    limit: 20,
    title: LANE_COPY.history.title,
    description: LANE_COPY.history.description,
    commands: LANE_COMMANDS.history,
    emptyMessage: LANE_COPY.history.empty,
    filteredEmptyMessage: "No requests match the current search.",
  },
];

export function SupplierRequestLists({ initialRows }: { initialRows: SupplierRequestListRow[] }) {
  return (
    <EntityList
      resource={{ key: "communications.supplier-requests" }}
      initialRows={initialRows}
      definition={LIST_DEFINITION}
      getId={(row) => row.id}
      rowLabel={(row) => `${row.supplierName} request`}
      emptyMessage="No supplier requests."
      tabs={{
        defaultTab: "pending",
        label: "Supplier request workflow",
        items: REQUEST_TABS,
      }}
    />
  );
}

function StatusBadge({ status, warning }: { status: string; warning: boolean }) {
  if (warning) {
    return <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-800 dark:text-amber-100">unacknowledged</span>;
  }
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    acknowledged: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    declined: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
    cancelled: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${styles[status] ?? styles.cancelled}`}>{status}</span>;
}
