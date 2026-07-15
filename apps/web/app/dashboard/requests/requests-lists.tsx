"use client";

import { useMemo, useState } from "react";
import {
  ListCommandToolbar,
  ListSearchPanel,
  ListSurface,
  SortButton,
  TabbedListSurface,
  useFrameworkListData,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { SupplierRequestListRow } from "@/lib/list-resources";
import { approveRequest, declineRequest, handToDriver } from "./actions";

type Lane = "pending" | "approved" | "handed" | "history";
type CommandId = "approve" | "decline" | "hand";
type RequestAction = (formData: FormData) => Promise<ListMutationResult>;

const COLUMNS: ColumnDef<SupplierRequestListRow>[] = [
  { key: "supplierName", label: "Supplier", accessor: (row) => row.supplierName, sortable: true, filter: "select" },
  { key: "typeLabel", label: "Request", accessor: (row) => row.typeLabel, sortable: true, filter: "select" },
  { key: "amount", label: "Amount", accessor: (row) => row.amount == null ? null : Number(row.amount), sortable: true, lov: false, searchInput: "number" },
  { key: "requestedAt", label: "Requested", accessor: (row) => row.requestedAt, sortable: true, searchInput: "date" },
  { key: "handedAt", label: "Handed", accessor: (row) => row.handedAt, sortable: true, searchInput: "date" },
  { key: "note", label: "Note", accessor: (row) => row.note, sortable: true, filter: "text", lov: false },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select" },
];

const DEFINITIONS: Record<Lane, ListDefinition<SupplierRequestListRow>> = {
  pending: {
    columns: COLUMNS,
    selectionMode: "single",
    commands: [
      { id: "approve", label: "Approve", requiresSelection: true },
      { id: "decline", label: "Decline", requiresSelection: true, destructive: true },
    ],
  },
  approved: {
    columns: COLUMNS,
    selectionMode: "single",
    commands: [{ id: "hand", label: "Mark handed to driver", requiresSelection: true }],
  },
  handed: { columns: COLUMNS, selectionMode: "single", commands: [] },
  history: { columns: COLUMNS, selectionMode: "single", commands: [] },
};

const ACTIONS: Record<CommandId, RequestAction> = {
  approve: approveRequest,
  decline: declineRequest,
  hand: handToDriver,
};

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

function formatAmount(amount: string | null) {
  return amount == null
    ? "—"
    : `LKR ${Number(amount).toLocaleString("en-LK", { minimumFractionDigits: 2 })}`;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export function SupplierRequestLists({ initialRows }: { initialRows: SupplierRequestListRow[] }) {
  const { rows, refreshing, mutate } = useFrameworkListData({
    initialRows,
    resource: { key: "communications.supplier-requests" },
  });
  const lanes = useMemo(() => ({
    pending: rows.filter((row) => row.status === "pending"),
    approved: rows.filter((row) => row.status === "approved"),
    handed: rows.filter((row) => row.status === "handed_to_driver"),
    history: rows.filter((row) => ["acknowledged", "declined", "cancelled"].includes(row.status)).slice(0, 20),
  }), [rows]);

  return (
    <TabbedListSurface
      defaultTab="pending"
      tabs={[
        { id: "pending", label: "Pending", count: String(lanes.pending.length) },
        { id: "approved", label: "Approved", count: String(lanes.approved.length) },
        { id: "handed", label: "Awaiting acknowledgement", count: String(lanes.handed.length) },
        { id: "history", label: "History", count: String(lanes.history.length) },
      ]}
    >
      <RequestLane lane="pending" rows={lanes.pending} refreshing={refreshing} mutate={mutate} />
      <RequestLane lane="approved" rows={lanes.approved} refreshing={refreshing} mutate={mutate} />
      <RequestLane lane="handed" rows={lanes.handed} refreshing={refreshing} mutate={mutate} />
      <RequestLane lane="history" rows={lanes.history} refreshing={refreshing} mutate={mutate} />
    </TabbedListSurface>
  );
}

function RequestLane({
  lane,
  rows,
  refreshing,
  mutate,
}: {
  lane: Lane;
  rows: SupplierRequestListRow[];
  refreshing: boolean;
  mutate: (action: () => Promise<ListMutationResult>) => Promise<boolean>;
}) {
  const definition = DEFINITIONS[lane];
  const copy = LANE_COPY[lane];
  const controls = useListControls(rows, definition.columns);
  const selection = useListSelection(rows, {
    mode: definition.selectionMode ?? "single",
    getId: (row) => row.id,
  });
  const [busyCommand, setBusyCommand] = useState<CommandId | null>(null);
  const [confirmCommand, setConfirmCommand] = useState<CommandId | null>(null);

  async function runCommand(id: CommandId) {
    if (!selection.selectedId) return;
    const formData = new FormData();
    formData.set("id", selection.selectedId);
    setBusyCommand(id);
    try {
      if (await mutate(() => ACTIONS[id](formData))) selection.clear();
    } finally {
      setBusyCommand(null);
      setConfirmCommand(null);
    }
  }

  const warning = lane === "handed";
  return (
    <ListSurface
      title={copy.title}
      description={copy.description}
      refreshing={refreshing}
      className={warning ? "border-amber-300 dark:border-amber-700" : ""}
      headerClassName={warning ? "bg-amber-50/80 dark:bg-amber-950/30" : ""}
    >
      <ListCommandToolbar mode={definition.selectionMode ?? "single"} count={selection.selectedCount}>
        {(definition.commands ?? []).map((command) => {
          const id = command.id as CommandId;
          const busy = busyCommand === id;
          return (
            <button
              key={command.id}
              type="button"
              onClick={() => command.destructive ? setConfirmCommand(id) : runCommand(id)}
              disabled={!selection.selectedId || busyCommand !== null}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                command.destructive
                  ? "border-red-200 bg-white text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-stone-900 dark:text-red-300 dark:hover:bg-red-950"
                  : "border-stone-300 bg-white text-stone-700 hover:bg-green-50 hover:text-green-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-green-950 dark:hover:text-green-300"
              }`}
            >
              {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
              {busy ? "Working…" : command.label}
            </button>
          );
        })}
      </ListCommandToolbar>
      <ConfirmationDialog
        open={confirmCommand === "decline"}
        title="Decline supplier request?"
        description="The selected request will move to declined history and cannot continue through the approval and handover workflow."
        confirmLabel="Decline request"
        destructive
        busy={busyCommand === "decline"}
        onCancel={() => setConfirmCommand(null)}
        onConfirm={() => runCommand("decline")}
      />
      <ListSearchPanel columns={definition.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={`border-b text-left text-xs uppercase tracking-wide ${warning ? "border-amber-200 text-amber-800 dark:border-amber-800 dark:text-amber-300" : "border-stone-200 text-stone-500 dark:border-stone-700 dark:text-stone-400"}`}>
              {COLUMNS.map((column) => (
                <th key={column.key} className="px-4 py-3">
                  {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {controls.rows.map((request) => (
              <tr
                key={request.id}
                {...selection.rowProps(request.id)}
                className={`cursor-pointer border-b align-top last:border-0 ${
                  warning
                    ? `border-amber-200 dark:border-amber-900 ${selection.isSelected(request.id) ? "bg-amber-100 dark:bg-amber-950/60" : "bg-amber-50/60 dark:bg-amber-950/20"}`
                    : `border-stone-100 dark:border-stone-800 ${selection.isSelected(request.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`
                }`}
              >
                <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100">{request.supplierName}</td>
                <td className="px-4 py-3">{request.typeLabel}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium">{formatAmount(request.amount)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-stone-500 dark:text-stone-400">{formatDate(request.requestedAt)}</td>
                <td className={`whitespace-nowrap px-4 py-3 text-xs ${warning ? "text-amber-700 dark:text-amber-300" : "text-stone-500 dark:text-stone-400"}`}>{formatDate(request.handedAt)}</td>
                <td className="max-w-sm px-4 py-3 text-stone-600 dark:text-stone-300">{request.note || "—"}</td>
                <td className="px-4 py-3"><StatusBadge status={request.status} warning={warning} /></td>
              </tr>
            ))}
            {controls.rows.length === 0 && rows.length > 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No requests match the current search.</td></tr>
            )}
            {rows.length === 0 && (
              <tr><td colSpan={7} className={`px-4 py-8 text-center ${warning ? "text-amber-700 dark:text-amber-400" : "text-stone-400 dark:text-stone-500"}`}>{copy.empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </ListSurface>
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
