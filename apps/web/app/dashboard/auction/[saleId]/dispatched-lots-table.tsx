"use client";

import { EntityList, type EntityListColumn, type EntityListCommand } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { AppButton } from "@/components/ui/button";
import type { ListMutationResult } from "@/lib/list-mutations";
import { createDispatchedLotForList, deleteLot, markReprint, updateLot } from "../actions";
import { LOT_STATES } from "../lot-states";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";
import { stateBucket } from "../state-buckets";
import type { LotRow } from "./lot-row";

const REPRINTABLE_STATES = new Set(["acknowledged", "catalogued", "valued", "withdrawn"]);
const inputClass = "w-20 rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 outline-none focus:border-green-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";
const numberInputClass = `${inputClass} text-right`;
const createInputClass = "min-h-9 w-full min-w-20 rounded-md border border-green-300 bg-white px-2 text-sm text-stone-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/15 dark:border-green-800 dark:bg-stone-900 dark:text-stone-100";

function invoiceLabel(row: LotRow) {
  const invoices = (row.lot_invoices ?? []).map((invoice) => invoice.invoice_no);
  return (invoices.length ? invoices : [row.invoice_no ?? ""])
    .map(formatFourDigitNo)
    .filter(Boolean)
    .join(", ");
}

function statusCell(row: LotRow, soldLotIds: Set<string>) {
  const displayState = soldLotIds.has(row.id) ? "sold" : row.state;
  const bucket = stateBucket(displayState);
  const netWeight = Number(row.net_wt ?? 0);
  const minNetKg = row.threshold_min_net_kg ?? 0;
  const hasMinimumWeightIssue =
    row.threshold_applies && minNetKg > 0 && netWeight > 0 && netWeight < minNetKg;

  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${bucket.style}`}
        title={row.shutout_reason ? `${displayState}: ${row.shutout_reason}` : displayState ?? ""}
      >
        {bucket.label}
      </span>
      {hasMinimumWeightIssue && (
        <span
          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-300"
          title={`Net weight ${netWeight.toFixed(2)} kg is below the ${minNetKg.toFixed(2)} kg broker/grade threshold.`}
        >
          Min kg
        </span>
      )}
    </div>
  );
}

function columns(isOwner: boolean, soldLotIds: Set<string>): EntityListColumn<LotRow>[] {
  return [
    {
      key: "invoice_no",
      label: "Invoice(s)",
      accessor: (row) => (row.lot_invoices ?? []).map((invoice) => invoice.invoice_no).join(", ") || row.invoice_no || null,
      sortable: true,
      filter: "text",
      render: (row) => {
        const invoices = row.lot_invoices ?? [];
        return (
          <div className="font-medium">
            {invoiceLabel(row) || "—"}
            {invoices.length > 1 && (
              <span className="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                {invoices.length} invoices
              </span>
            )}
            {row.lot_source === "acknowledgement" && (
              <span
                className="ml-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-xs text-purple-800 dark:bg-purple-900 dark:text-purple-300"
                title="This lot was added from the broker acknowledgement PDF."
              >
                From ack
              </span>
            )}
          </div>
        );
      },
      edit: (row, { formId }) => (
        <input
          form={formId}
          name="invoice_no"
          defaultValue={formatFourDigitNo(row.invoice_no)}
          onBlur={(event) => {
            event.currentTarget.value = formatFourDigitNo(event.currentTarget.value);
          }}
          className={inputClass}
        />
      ),
    },
    {
      key: "sale_no",
      label: "Sale",
      accessor: (row) => row.final_sale_no ?? row.provisional_sale_no ?? null,
      sortable: true,
      filter: "text",
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="tabular-nums">{formatSaleNo(row.final_sale_no ?? row.provisional_sale_no) || "—"}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
            row.final_sale_no
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
              : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"
          }`}>
            {row.final_sale_no ? "Final" : "Temporary"}
          </span>
        </div>
      ),
    },
    {
      key: "lot_no",
      label: "Lot no.",
      accessor: (row) => row.lot_no ?? null,
      sortable: true,
      filter: "text",
      edit: (row, { formId }) => (
        <input
          form={formId}
          name="lot_no"
          defaultValue={formatFourDigitNo(row.lot_no)}
          onBlur={(event) => {
            event.currentTarget.value = formatFourDigitNo(event.currentTarget.value);
          }}
          className={inputClass}
          placeholder="Lot no."
        />
      ),
    },
    {
      key: "grade",
      label: "Grade",
      accessor: (row) => row.grade ?? null,
      sortable: true,
      filter: "select",
      edit: (row, { formId }) => (
        <input form={formId} name="grade" defaultValue={row.grade ?? ""} className={inputClass} />
      ),
    },
    {
      key: "bags",
      label: "Bags",
      accessor: (row) => row.bags ?? null,
      sortable: true,
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      edit: (row, { formId }) => (
        <input form={formId} name="bags" type="number" min="0" step="1" defaultValue={row.bags ?? ""} className={numberInputClass} />
      ),
    },
    {
      key: "kg_per_bag",
      label: "kg/bag",
      accessor: (row) => row.kg_per_bag ?? null,
      sortable: true,
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (row) => row.kg_per_bag == null ? "—" : Number(row.kg_per_bag).toFixed(2),
      edit: (row, { formId }) => (
        <input form={formId} name="kg_per_bag" type="number" min="0" step="0.01" defaultValue={row.kg_per_bag == null ? "" : Number(row.kg_per_bag)} className={numberInputClass} />
      ),
    },
    {
      key: "sample_allowance",
      label: "Sample kg",
      accessor: (row) => Number(row.sample_allowance ?? 0),
      sortable: true,
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (row) => Number(row.sample_allowance ?? 0).toFixed(2),
      edit: (row, { formId }) => (
        <input form={formId} name="sample_allowance" type="number" min="0" step="0.01" defaultValue={row.sample_allowance == null ? "" : Number(row.sample_allowance)} className={numberInputClass} />
      ),
    },
    {
      key: "net_wt",
      label: "Net kg",
      accessor: (row) => Number(row.net_wt ?? 0),
      sortable: true,
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (row) => Number(row.net_wt ?? 0).toFixed(2),
    },
    {
      key: "state",
      label: "State",
      accessor: (row) => soldLotIds.has(row.id) ? "sold" : row.state ?? null,
      sortable: true,
      filter: "select",
      filterOptions: LOT_STATES.map((state) => ({ value: state, label: state })),
      render: (row) => statusCell(row, soldLotIds),
      edit: isOwner
        ? (row, { formId }) => (
            <select form={formId} name="state" defaultValue={row.state ?? "invoiced"} className={inputClass}>
              {LOT_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          )
        : undefined,
    },
  ];
}

function InlineCreateCells({
  formId,
  grades,
}: {
  formId: string;
  grades: { code: string; name: string }[];
}) {
  return (
    <>
      <td className="px-4 py-3">
        <input
          form={formId}
          name="invoice_no"
          required
          placeholder="e.g. 0058"
          aria-label="Invoice number"
          onBlur={(event) => {
            event.currentTarget.value = formatFourDigitNo(event.currentTarget.value);
          }}
          className={createInputClass}
        />
      </td>
      <td className="px-4 py-3 text-sm text-stone-400">Assigned after save</td>
      <td className="px-4 py-3">
        <input
          form={formId}
          name="lot_no"
          placeholder="Optional"
          aria-label="Lot number"
          onBlur={(event) => {
            event.currentTarget.value = formatFourDigitNo(event.currentTarget.value);
          }}
          className={createInputClass}
        />
      </td>
      <td className="px-4 py-3">
        <select form={formId} name="grade" required defaultValue="" aria-label="Grade" className={createInputClass}>
          <option value="" disabled>Select</option>
          {grades.map((grade) => (
            <option key={grade.code} value={grade.code}>{grade.code}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <input form={formId} name="bags" type="number" min="1" step="1" required placeholder="0" aria-label="Bags" className={`${createInputClass} text-right`} />
      </td>
      <td className="px-4 py-3">
        <input form={formId} name="kg_per_bag" type="number" min="0.01" step="0.01" required placeholder="0.00" aria-label="Kilograms per bag" className={`${createInputClass} text-right`} />
      </td>
      <td className="px-4 py-3">
        <input form={formId} name="sample_allowance" type="number" min="0" step="0.01" defaultValue="0" aria-label="Sample kilograms" className={`${createInputClass} text-right`} />
      </td>
      <td className="px-4 py-3 text-right text-xs font-medium text-stone-500 dark:text-stone-400">Calculated</td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-300">
          Invoiced
        </span>
      </td>
    </>
  );
}

async function deleteLots(ids: string[], saleId: string): Promise<ListMutationResult> {
  let succeeded = 0;
  const failures: string[] = [];
  for (const id of ids) {
    const result = await deleteLot(id, saleId);
    if (result.ok) succeeded += 1;
    else failures.push(result.error);
  }
  if (succeeded === 0) {
    return { ok: false, error: failures[0] ?? "No lots were deleted." };
  }
  return {
    ok: true,
    notice: `${succeeded} lot${succeeded === 1 ? "" : "s"} deleted${failures.length ? `; ${failures.length} could not be deleted` : ""}.`,
  };
}

export function DispatchedLotsTable({
  initialRows,
  saleId,
  isOwner,
  canEdit,
  canAdd,
  grades,
  soldLotIds,
  title = "Lot invoices",
  onRowsChange,
}: {
  initialRows: LotRow[];
  saleId: string;
  isOwner: boolean;
  canEdit: boolean;
  canAdd: boolean;
  grades: { code: string; name: string }[];
  soldLotIds: string[];
  title?: string;
  onRowsChange?: (rows: LotRow[]) => void;
}) {
  const soldIds = new Set(soldLotIds);
  const definition: ListDefinition<LotRow> = {
    columns: columns(isOwner, soldIds),
    selectionMode: canEdit ? "multi" : "single",
    add: canAdd,
    edit: canEdit,
    delete: canEdit,
  };
  const commands: EntityListCommand<LotRow>[] = [{
    id: "mark-reprint",
    label: "Re-print",
    pendingLabel: "Marking…",
    visible: canEdit && isOwner,
    disabled: ({ selectedRows }) =>
      selectedRows.length !== 1 || !REPRINTABLE_STATES.has(selectedRows[0]?.state ?? ""),
    disabledReason: ({ selectedRows }) => {
      if (selectedRows.length !== 1) return "Select exactly one lot.";
      if (!REPRINTABLE_STATES.has(selectedRows[0]?.state ?? "")) {
        return "Only acknowledged, catalogued, valued, or withdrawn lots can be marked as re-prints.";
      }
      return undefined;
    },
    panel: {
      title: "Mark selected lot as re-print",
      action: (formData, { selectedRows }) => markReprint(selectedRows[0]!.id, saleId, formData),
      render: ({ action, close, command }) => (
        <ReprintForm lot={command.selectedRows[0]!} action={action} onCancel={close} />
      ),
    },
  }];

  return (
    <EntityList
      resource={{ key: "auction.dispatch-lots", params: { saleId } }}
      initialRows={initialRows}
      definition={definition}
      getId={(row) => row.id}
      rowLabel={(row) => `lot ${invoiceLabel(row) || row.lot_no || row.id}`}
      title={title}
      description={(rows) => {
        const totalNet = rows.reduce((sum, row) => sum + Number(row.net_wt ?? 0), 0);
        return `${rows.length} lot${rows.length === 1 ? "" : "s"} · ${totalNet.toFixed(2)} kg net`;
      }}
      emptyMessage="No lots yet. Use New lot to enter the invoices under this broker invoice."
      filteredEmptyMessage="No lots match these filters."
      canCreate={canAdd}
      create={canAdd ? {
        action: (formData) => createDispatchedLotForList(saleId, formData),
        label: "New lot",
        disabledReason: "Finish the current lot action first.",
        renderRow: ({ formId }) => <InlineCreateCells formId={formId} grades={grades} />,
      } : undefined}
      createPlacement="toolbar"
      edit={canEdit ? {
        action: (row, formData) => updateLot(row.id, saleId, formData),
        label: "Edit",
        saveLabel: "Save changes",
      } : undefined}
      canDelete={canEdit}
      deleteAction={canEdit ? {
        action: (ids) => deleteLots(ids, saleId),
        disabled: (rows) => rows.some((row) => !isOwner && row.state !== "invoiced" && row.state !== "pending"),
        disabledReason: (rows) =>
          rows.some((row) => !isOwner && row.state !== "invoiced" && row.state !== "pending")
            ? "Only owners can delete lots after invoicing."
            : undefined,
        title: (count) => `Delete ${count} lot${count === 1 ? "" : "s"}?`,
        description: () => "Owned invoice and valuation records are removed. Financial sale or VAT records safely block deletion. This cannot be undone.",
        confirmLabel: "Delete",
      } : undefined}
      commands={commands}
      onRowsChange={onRowsChange}
    />
  );
}

function ReprintForm({
  lot,
  action,
  onCancel,
}: {
  lot: LotRow;
  action: (formData: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const invoices = (lot.lot_invoices ?? []).map((invoice) => invoice.invoice_no);
  const label = invoices.length > 1 ? `Invoices: ${invoices.join(", ")}` : `Invoice: ${invoices[0] ?? lot.invoice_no ?? ""}`;

  return (
    <form action={action} className="mt-1 space-y-3 rounded-lg border border-stone-200 p-3 text-left dark:border-stone-700">
      <p className="text-xs text-stone-500 dark:text-stone-400">{label}</p>
      <p className="text-xs leading-5 text-stone-600 dark:text-stone-300">
        This keeps the lot in this sale as history. Adding the same invoice to a later broker invoice links the new lot as the re-print.
      </p>
      <label className="block text-xs font-medium text-stone-600 dark:text-stone-300">
        Additional sample kg
        <input
          name="additional_sample_kg"
          type="number"
          min="0"
          step="0.01"
          defaultValue={Number(lot.sample_allowance ?? 0) || ""}
          placeholder="0.00"
          className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
        />
      </label>
      <div className="flex justify-end gap-2">
        <AppButton type="button" size="sm" onClick={onCancel}>Cancel</AppButton>
        <SubmitButton
          pendingText="Marking…"
          className="min-h-9 rounded-xl border-transparent bg-orange-600 px-3 text-xs text-white hover:bg-orange-700"
        >
          Mark re-print
        </SubmitButton>
      </div>
    </form>
  );
}
