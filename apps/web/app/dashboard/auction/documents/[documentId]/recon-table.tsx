"use client";

import type { ReconRow, ReconStatus } from "@tea/api";
import { EntityList, type EntityListColumn, type EntityListCommand } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { AppButton } from "@/components/ui/button";
import { registerLotReprint } from "@/app/dashboard/auction/actions";

/**
 * What the row is SHOWN as. Two of these are not reconciliation statuses:
 * recon ① compares only against the lots invoiced in this sale group, so a lot
 * carried forward from an earlier broker invoice lands in `unexpected` there
 * and is resolved afterwards (see resolveAckCarryForward). Displaying it as
 * `unexpected` would leave the operator unable to tell a registered re-print
 * from tea the broker catalogued that the factory has no record of.
 */
export type ReconDisplayStatus = ReconStatus | "re-print" | "rolled forward";

export type ReviewReconRow = ReconRow & {
  display: ReconDisplayStatus;
  /** Why the row is no longer unexpected, in the operator's words. */
  carryForwardNote: string | null;
  /** The lot a confirmed acknowledgement created for this row, if any. */
  lotId: string | null;
  reprintRegistered: boolean;
  canRegister: boolean;
};

const STATUS_STYLE: Record<ReconDisplayStatus, string> = {
  catalogued: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400",
  shutout: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400",
  pending: "bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300",
  unexpected: "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-400",
  "re-print": "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-300",
  "rolled forward": "bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-300",
};

const statusLabel = (row: ReviewReconRow) => row.display === "shutout" ? "acknowledged" : row.display;

const STATUS_OPTIONS = ["catalogued", "acknowledged", "pending", "unexpected", "re-print", "rolled forward"];

const COLUMNS: EntityListColumn<ReviewReconRow>[] = [
  { key: "invoiceNo", label: "Invoice", accessor: (row) => row.invoiceNo, sortable: true, filter: "text", cellClassName: "font-medium" },
  { key: "status", label: "Result", accessor: (row) => statusLabel(row), sortable: true, filter: "select", filterOptions: STATUS_OPTIONS.map((status) => ({ value: status, label: status })), minWidth: 150, render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[row.display]}`}>{statusLabel(row)}</span> },
  { key: "invoiced", label: "Invoiced", accessor: (row) => row.invoiced ? `${row.invoiced.grade} · ${row.invoiced.netWt.toFixed(2)} kg` : null, sortable: true, render: (row) => row.invoiced ? `${row.invoiced.grade} · ${row.invoiced.netWt.toFixed(2)} kg` : "—" },
  { key: "lotNo", label: "Lot no.", accessor: (row) => row.ack?.lotNo ?? null, sortable: true, filter: "text", render: (row) => row.ack?.lotNo ?? "—" },
  { key: "ack", label: "Catalogued (ack)", accessor: (row) => row.ack ? `${row.ack.grade} · ${row.ack.netWt.toFixed(2)} kg` : null, sortable: true, render: (row) => row.ack ? `${row.ack.grade} · ${row.ack.netWt.toFixed(2)} kg` : "—" },
  { key: "weightDelta", label: "Δ net kg", accessor: (row) => row.weightDelta ?? null, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => row.weightDelta == null ? "—" : `${row.weightDelta > 0 ? "+" : ""}${row.weightDelta.toFixed(2)}` },
  { key: "shutout", label: "Shutout", accessor: (row) => row.display === "shutout", boolean: true, sortable: true, filter: "select" },
  { key: "shutoutReason", label: "Shutout reason", accessor: (row) => row.ack?.shutoutReason ?? null, sortable: true, filter: "text", cellClassName: "text-xs text-stone-500 dark:text-stone-400", render: (row) => row.ack?.shutoutReason ?? "—" },
  { key: "reprintRegistered", label: "Re-print registered", accessor: (row) => row.reprintRegistered, boolean: true, sortable: true, filter: "select" },
  { key: "notes", label: "Notes", accessor: (row) => reconciliationNotes(row), filter: "text", lov: false, cellClassName: "text-xs text-stone-500 dark:text-stone-400", render: reconciliationNotes },
];

const LIST = { columns: COLUMNS, selectionMode: "single" } satisfies ListDefinition<ReviewReconRow>;

export function ReconTable({
  rows,
  saleId,
  warningInvoiceNos = [],
  canRegisterReprint = false,
}: {
  rows: ReviewReconRow[];
  saleId: string;
  warningInvoiceNos?: string[];
  canRegisterReprint?: boolean;
}) {
  const warningInvoices = new Set(warningInvoiceNos);

  const commands: EntityListCommand<ReviewReconRow>[] = [{
    id: "register-reprint",
    label: "Register re-print",
    pendingLabel: "Registering…",
    visible: canRegisterReprint,
    disabled: ({ selectedRows }) => selectedRows.length !== 1 || !selectedRows[0]?.canRegister,
    disabledReason: ({ selectedRows }) => {
      if (selectedRows.length !== 1) return "Select exactly one row.";
      if (selectedRows[0]?.display !== "unexpected") return "Only an unexpected invoice can be registered as a re-print.";
      return selectedRows[0]?.canRegister ? undefined : "This invoice is already a re-print.";
    },
    panel: {
      title: "Register as a re-print",
      action: (formData, { selectedRows }) => registerLotReprint(saleId, selectedRows[0]!.invoiceNo, formData),
      render: ({ action, close, command }) => (
        <RegisterReprintForm row={command.selectedRows[0]!} action={action} onCancel={close} />
      ),
    },
  }];

  return (
    <EntityList
      scope="acknowledgement-reconciliation"
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.invoiceNo}
      rowLabel={(row) => `invoice ${row.invoiceNo}`}
      title="Acknowledgement reconciliation"
      description="Invoiced lots compared with the staged broker acknowledgement."
      emptyMessage="No acknowledgement rows."
      commands={commands}
      rowClassName={(row) => warningInvoices.has(row.invoiceNo) ? "bg-amber-50/80 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/30 dark:ring-amber-700" : ""}
    />
  );
}

function RegisterReprintForm({
  row,
  action,
  onCancel,
}: {
  row: ReviewReconRow;
  action: (formData: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form action={action} className="mt-1 space-y-3 rounded-lg border border-stone-200 p-3 text-left dark:border-stone-700">
      <input type="hidden" name="grade" value={row.ack?.grade ?? ""} />
      <input type="hidden" name="net_wt" value={row.ack?.netWt ?? 0} />
      <p className="text-xs text-stone-500 dark:text-stone-400">Invoice: {row.invoiceNo}</p>
      <p className="text-xs leading-5 text-stone-600 dark:text-stone-300">
        The broker catalogued this invoice but the system has no record of it. Registering it declares that it was
        offered before. Give the sale it was first offered in to record that sale too, or leave it blank.
      </p>
      <label className="block text-xs font-medium text-stone-600 dark:text-stone-300">
        First sale no. (optional)
        <input
          name="first_sale_no"
          inputMode="numeric"
          placeholder="e.g. 0016"
          className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
        />
      </label>
      <div className="flex gap-2">
        <SubmitButton pendingText="Registering…" variant="primary" className="rounded-md px-4 py-2 text-sm">
          Confirm re-print
        </SubmitButton>
        <AppButton type="button" variant="ghost" size="sm" className="rounded-md px-4 py-2 text-sm" onClick={onCancel}>
          Cancel
        </AppButton>
      </div>
    </form>
  );
}

function reconciliationNotes(row: ReviewReconRow) {
  const notes = [
    row.carryForwardNote ?? "",
    row.display === "pending" ? "Invoiced, not in this ack — may roll to a later sale" : "",
    row.display === "unexpected" && !row.carryForwardNote ? "In the acknowledgement but never invoiced" : "",
    row.gradeMismatch ? "grade differs" : "",
    row.weightDelta != null && Math.abs(row.weightDelta) > 0.01 ? "weight differs" : "",
  ].filter(Boolean);
  return notes.join(" · ") || "—";
}
