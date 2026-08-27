"use client";

import type { ReconRow, ReconStatus } from "@tea/api";
import { EntityList, type EntityListColumn, type EntityListCommand } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { AppButton } from "@/components/ui/button";
import { registerLotReprint, registerLotSkippedSale } from "@/app/dashboard/auction/actions";

/**
 * What the row is SHOWN as. Two of these are not reconciliation statuses:
 * recon ① compares only against the lots invoiced in this sale group, so a lot
 * carried forward from an earlier broker invoice lands in `not-acknowledged`
 * there and is resolved afterwards (see resolveAckCarryForward). The
 * distinction is kept internally so a registered re-print can be told apart
 * from tea the broker catalogued that the factory has no record of; the
 * operator only ever sees the two labels below.
 */
export type ReconDisplayStatus = ReconStatus | "re-print" | "rolled forward";

export type ReviewReconRow = ReconRow & {
  display: ReconDisplayStatus;
  /** Why the row reconciles after all, in the operator's words. */
  carryForwardNote: string | null;
  /** The lot a confirmed acknowledgement created for this row, if any. */
  lotId: string | null;
  reprintRegistered: boolean;
  canRegister: boolean;
};

/**
 * There are exactly two results an operator sees, with one colour each.
 * Shutout, re-print and rolled-forward are all still catalogued/reconciled tea
 * — what makes them special lives in their own columns, so they must not read
 * as a separate result here.
 */
const DISPLAY_LABEL: Record<ReconDisplayStatus, "catalogued" | "not-acknowledged"> = {
  catalogued: "catalogued",
  shutout: "catalogued",
  "re-print": "catalogued",
  "rolled forward": "catalogued",
  "not-acknowledged": "not-acknowledged",
};

const LABEL_STYLE: Record<"catalogued" | "not-acknowledged", string> = {
  catalogued: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400",
  "not-acknowledged": "bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300",
};

const statusLabel = (row: ReviewReconRow) => DISPLAY_LABEL[row.display];

/**
 * The acknowledgement lists this lot but we hold no invoice for it. Say so,
 * rather than leaving a bare "—" the operator has to interpret: it is the row
 * "Register re-print" acts on, and the one worth a second look otherwise.
 */
const invoicedLabel = (row: ReviewReconRow) =>
  row.invoiced ? `${row.invoiced.grade} · ${row.invoiced.netWt.toFixed(2)} kg` : "Not invoiced";

const STATUS_OPTIONS = ["catalogued", "not-acknowledged"];

const COLUMNS: EntityListColumn<ReviewReconRow>[] = [
  { key: "invoiceNo", label: "Invoice", accessor: (row) => row.invoiceNo, sortable: true, filter: "text", cellClassName: "font-medium" },
  { key: "status", label: "Result", accessor: (row) => statusLabel(row), sortable: true, filter: "select", filterOptions: STATUS_OPTIONS.map((status) => ({ value: status, label: status })), minWidth: 150, render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${LABEL_STYLE[statusLabel(row)]}`}>{statusLabel(row)}</span> },
  { key: "invoiced", label: "Invoiced", accessor: invoicedLabel, sortable: true, filter: "text", render: (row) => row.invoiced
    ? invoicedLabel(row)
    : <span className="text-xs text-amber-700 dark:text-amber-500">{invoicedLabel(row)}</span> },
  { key: "lotNo", label: "Lot no.", accessor: (row) => row.ack?.lotNo ?? null, sortable: true, filter: "text", render: (row) => row.ack?.lotNo ?? "—" },
  { key: "ack", label: "Catalogued (ack)", accessor: (row) => row.ack ? `${row.ack.grade} · ${row.ack.netWt.toFixed(2)} kg` : null, sortable: true, render: (row) => row.ack ? `${row.ack.grade} · ${row.ack.netWt.toFixed(2)} kg` : "—" },
  { key: "weightDelta", label: "Δ net kg", accessor: (row) => row.weightDelta ?? null, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => row.weightDelta == null ? "—" : `${row.weightDelta > 0 ? "+" : ""}${row.weightDelta.toFixed(2)}` },
  // A shutout reason IS the shutout: the document printed a held-back flag for
  // this row. Reading it alongside `display` keeps the two columns from
  // contradicting each other when the row is shown as something else — a
  // carry-forward outcome, say, which replaces `display` but not the ack data.
  { key: "shutout", label: "Shutout", accessor: (row) => row.display === "shutout" || Boolean(row.ack?.shutoutReason), boolean: true, sortable: true, filter: "select" },
  { key: "shutoutReason", label: "Shutout reason", accessor: (row) => row.ack?.shutoutReason ?? null, sortable: true, filter: "text", cellClassName: "text-xs text-stone-500 dark:text-stone-400", render: (row) => row.ack?.shutoutReason ?? "—" },
  { key: "reprintRegistered", label: "Re-print", accessor: (row) => row.reprintRegistered, boolean: true, sortable: true, filter: "select" },
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
      const row = selectedRows[0]!;
      if (!row.ack || row.invoiced) return "Only an acknowledgement row we never invoiced can be registered as a re-print.";
      return row.canRegister ? undefined : "This invoice is already a re-print.";
    },
    panel: {
      title: "Register as a re-print",
      action: (formData, { selectedRows }) => registerLotReprint(saleId, selectedRows[0]!.invoiceNo, formData),
      render: ({ action, close, command }) => (
        <RegisterReprintForm row={command.selectedRows[0]!} action={action} onCancel={close} />
      ),
    },
  }, {
    // Same rows as Register re-print — an acknowledgement line this system has
    // no invoice for. Which of the two happened is a fact only the operator
    // holds: was the lot offered before and unsold (re-print), or dispatched to
    // an earlier sale the broker did not catalogue it in (skipped sale)?
    id: "register-skipped-sale",
    label: "Register skipped sale",
    pendingLabel: "Registering…",
    visible: canRegisterReprint,
    disabled: ({ selectedRows }) => selectedRows.length !== 1 || !selectedRows[0]?.canRegister,
    disabledReason: ({ selectedRows }) => {
      if (selectedRows.length !== 1) return "Select exactly one row.";
      const row = selectedRows[0]!;
      if (!row.ack || row.invoiced) return "Only an acknowledgement row we never invoiced can be registered as a skipped sale.";
      return row.canRegister ? undefined : "This invoice is already resolved.";
    },
    panel: {
      title: "Register a skipped sale",
      action: (formData, { selectedRows }) => registerLotSkippedSale(saleId, selectedRows[0]!.invoiceNo, formData),
      render: ({ action, close, command }) => (
        <RegisterSkippedSaleForm row={command.selectedRows[0]!} action={action} onCancel={close} />
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

function RegisterSkippedSaleForm({
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
        The broker catalogued this invoice here, but it was dispatched to an earlier sale that this system has no
        record of. Give that sale and the lot will be created in it, marked acknowledged and flagged as a skipped
        sale. It is added to this sale as a normal lot — not a re-print.
      </p>
      <label className="block text-xs font-medium text-stone-600 dark:text-stone-300">
        Dispatched to sale no.
        <input
          name="dispatched_sale_no"
          inputMode="numeric"
          required
          placeholder="e.g. 0015"
          className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
        />
      </label>
      <div className="flex gap-2">
        <SubmitButton pendingText="Registering…" variant="primary" className="rounded-md px-4 py-2 text-sm">
          Confirm skipped sale
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
    row.display === "not-acknowledged" ? "Invoiced, not in this acknowledgement — may roll to a later sale" : "",
    row.canRegister ? "Register it as a re-print if it was offered before" : "",
    row.gradeMismatch ? "grade differs" : "",
    row.weightDelta != null && Math.abs(row.weightDelta) > 0.01 ? "weight differs" : "",
  ].filter(Boolean);
  return notes.join(" · ") || "—";
}
