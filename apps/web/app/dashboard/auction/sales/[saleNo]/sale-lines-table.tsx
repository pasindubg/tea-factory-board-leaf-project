"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { EntityList, type EntityListColumn, type EntityListCommand } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { AppButton } from "@/components/ui/button";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { AuctionSaleLineListRow } from "@/lib/list-resources";
import { deleteLot } from "../../_actions/lots";
import { updateSaleLotsInline } from "../../actions";
import { money } from "../../format";

export type SaleLineRow = AuctionSaleLineListRow;

const EDITABLE_STATES = [
  "acknowledged",
  "pending",
  "missing",
  "shutout",
  "not-valued",
  "valued",
  "withdrawn",
  "re-print",
  "sold",
  "settled",
];
const rightAligned = "text-right tabular-nums";

const COLUMNS: EntityListColumn<SaleLineRow>[] = [
  {
    key: "dispatchSaleNo",
    label: "Broker invoice no.",
    accessor: (row) => row.dispatchSaleNo ?? null,
    sortable: true,
    filter: "text",
    lov: false,
    render: (row) => row.dispatchId ? (
      <Link href={`/dashboard/auction/${row.dispatchId}`} className="text-green-700 hover:underline dark:text-green-400">
        {row.dispatchSaleNo}
      </Link>
    ) : "—",
  },
  { key: "lotNo", label: "Lot no.", accessor: (row) => row.lotNo ?? null, sortable: true, filter: "text", lov: false },
  { key: "invoiceNo", label: "Invoice(s)", accessor: (row) => row.invoiceNo, sortable: true, filter: "text", lov: false, cellClassName: "font-medium" },
  { key: "grade", label: "Grade", accessor: (row) => row.grade ?? null, sortable: true, filter: "select" },
  {
    key: "stateLabel",
    label: "Status",
    accessor: (row) => row.stateLabel,
    sortable: true,
    filter: "select",
    render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${row.stateStyle}`}>{row.stateLabel}</span>,
  },
  {
    key: "buyerName",
    label: "Buyer",
    accessor: (row) => row.buyerName ?? null,
    sortable: true,
    filter: "select",
    render: (row) => (
      <>
        {row.buyerName ?? "—"}
        {row.buyerVatNo && <span className="ml-1 text-xs text-stone-400 dark:text-stone-500">{row.buyerVatNo}</span>}
      </>
    ),
  },
  { key: "bags", label: "Bags", accessor: (row) => row.bags ?? null, sortable: true, lov: false, searchInput: "number", headerClassName: "text-right", cellClassName: rightAligned },
  {
    key: "kgPerBag",
    label: "kg/bag",
    accessor: (row) => row.kgPerBag ?? null,
    sortable: true,
    lov: false,
    searchInput: "number",
    headerClassName: "text-right",
    cellClassName: rightAligned,
    render: (row) => row.kgPerBag == null ? "—" : row.kgPerBag.toFixed(2),
  },
  {
    key: "sampleKg",
    label: "Total sample kg",
    accessor: (row) => row.sampleKg ?? null,
    sortable: true,
    lov: false,
    searchInput: "number",
    headerClassName: "text-right",
    cellClassName: rightAligned,
    render: (row) => row.sampleKg == null ? "—" : row.sampleKg.toFixed(2),
  },
  {
    key: "netWt",
    label: "Net kg",
    accessor: (row) => row.netWt,
    sortable: true,
    lov: false,
    searchInput: "number",
    headerClassName: "text-right",
    cellClassName: rightAligned,
    render: (row) => row.netWt.toFixed(2),
  },
  {
    key: "pricePerKg",
    label: "Price/kg",
    accessor: (row) => row.pricePerKg ?? null,
    sortable: true,
    lov: false,
    searchInput: "number",
    headerClassName: "text-right",
    cellClassName: rightAligned,
    render: (row) => row.pricePerKg == null ? "—" : row.pricePerKg.toFixed(2),
  },
  {
    key: "proceeds",
    label: "Proceeds",
    accessor: (row) => row.proceeds ?? null,
    sortable: true,
    lov: false,
    searchInput: "number",
    headerClassName: "text-right",
    cellClassName: `${rightAligned} font-medium`,
    render: (row) => row.proceeds == null ? "—" : money(row.proceeds),
  },
  {
    key: "vatAmount",
    label: "VAT",
    accessor: (row) => row.vatAmount ?? null,
    sortable: true,
    lov: false,
    searchInput: "number",
    headerClassName: "text-right",
    cellClassName: rightAligned,
    render: (row) => row.vatAmount == null ? "—" : money(row.vatAmount),
  },
  {
    key: "onGuarantee",
    label: "Guarantee",
    accessor: (row) => row.onGuarantee == null ? "-" : row.onGuarantee ? "Guarantee" : "Cash",
    sortable: true,
    filter: "select",
    filterOptions: [
      { value: "Guarantee", label: "Guarantee" },
      { value: "Cash", label: "Cash" },
      { value: "-", label: "Not sold" },
    ],
    render: (row) => row.onGuarantee == null ? (
      <span className="text-stone-400 dark:text-stone-500">—</span>
    ) : (
      <span className={`rounded-full px-2 py-0.5 text-xs ${
        row.onGuarantee
          ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-400"
          : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"
      }`}>
        {row.onGuarantee ? "Guarantee" : "Cash"}
      </span>
    ),
  },
  {
    key: "reprint",
    label: "Re-print",
    accessor: (row) => row.reprint ? "Yes" : "No",
    sortable: true,
    filter: "select",
    filterOptions: [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }],
  },
  {
    key: "reprintCount",
    label: "Re-print count",
    accessor: (row) => row.reprintCount,
    sortable: true,
    lov: false,
    searchInput: "number",
    headerClassName: "text-right",
    cellClassName: rightAligned,
  },
];

async function deleteSaleLines(rows: SaleLineRow[]): Promise<ListMutationResult> {
  let succeeded = 0;
  const failures: string[] = [];
  for (const row of rows) {
    if (!row.dispatchId) {
      failures.push(`Invoice ${row.invoiceNo || row.id} is not linked to a broker invoice.`);
      continue;
    }
    const result = await deleteLot(row.id, row.dispatchId);
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

export function SaleLinesTable({
  saleId,
  rows: initialRows,
  canManage,
}: {
  saleId: string;
  rows: SaleLineRow[];
  canManage: boolean;
}) {
  const definition: ListDefinition<SaleLineRow> = {
    columns: COLUMNS,
    selectionMode: canManage ? "multi" : "single",
    add: false,
    edit: false,
    delete: canManage,
  };
  const commands: EntityListCommand<SaleLineRow>[] = [{
    id: "edit-sale-lines",
    label: ({ selectedRows }) => selectedRows.length > 1 ? `Edit ${selectedRows.length} lots` : "Edit",
    pendingLabel: "Saving…",
    visible: canManage,
    disabled: ({ selectedRows }) => selectedRows.length === 0,
    disabledReason: ({ selectedRows }) => selectedRows.length === 0 ? "Select one or more lots to edit." : undefined,
    panel: {
      title: ({ selectedRows }) => `Edit ${selectedRows.length} lot${selectedRows.length === 1 ? "" : "s"}`,
      action: (formData) => updateSaleLotsInline(saleId, formData),
      render: ({ action, close, command }) => (
        <SaleLinesEditForm rows={command.selectedRows} action={action} onCancel={close} />
      ),
    },
  }];

  return (
    <EntityList
      resource={{ key: "auction.sale-lines", params: { saleId } }}
      initialRows={initialRows}
      definition={definition}
      getId={(row) => row.id}
      rowLabel={(row) => `invoice ${row.invoiceNo || row.id}`}
      emptyMessage="No lots have been recorded for this sale yet."
      filteredEmptyMessage="No lots match these filters."
      commands={commands}
      canDelete={canManage}
      deleteAction={canManage ? {
        action: (_ids, rows) => deleteSaleLines(rows),
        disabled: (rows) => rows.some((row) => !row.dispatchId),
        disabledReason: (rows) =>
          rows.some((row) => !row.dispatchId) ? "Every selected lot must be linked to a broker invoice." : undefined,
        title: (count) => `Delete ${count} lot${count === 1 ? "" : "s"}?`,
        description: () => "This removes the selected lots plus their owned invoice and valuation records. Financial sale or VAT records safely block deletion. This cannot be undone.",
        confirmLabel: "Delete",
      } : undefined}
    />
  );
}

function SaleLinesEditForm({
  rows,
  action,
  onCancel,
}: {
  rows: SaleLineRow[];
  action: (formData: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form action={action} className="space-y-4">
      <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">
        Sold lots require Price/kg, proceeds, and VAT. Net kg is recalculated from bags, kg/bag, and sample kg.
      </p>
      <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
        {rows.map((row) => (
          <fieldset key={row.id} className="rounded-xl border border-stone-200 p-3 dark:border-stone-700">
            <input type="hidden" name="lot_id" value={row.id} />
            <input type="hidden" name="buyer_vat_no" value={row.buyerVatNo ?? ""} />
            <legend className="px-1 text-xs font-semibold text-stone-700 dark:text-stone-200">
              Invoice {row.invoiceNo || "—"} · Lot {row.lotNo || "—"}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Invoice(s)">
                <TextInput name="invoice_no" defaultValue={row.invoiceNo} required />
              </Field>
              <Field label="Lot no.">
                <TextInput name="lot_no" defaultValue={row.lotNo ?? ""} />
              </Field>
              <Field label="Grade">
                <TextInput name="grade" defaultValue={row.grade ?? ""} required />
              </Field>
              <Field label="Status">
                <select name="state" defaultValue={row.state ?? "acknowledged"} className={fieldClass}>
                  {EDITABLE_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                </select>
              </Field>
              <Field label="Buyer">
                <TextInput name="buyer_name" defaultValue={row.buyerName ?? ""} />
              </Field>
              <Field label="Bags">
                <NumberInput name="bags" defaultValue={row.bags} step="1" required />
              </Field>
              <Field label="kg/bag">
                <NumberInput name="kg_per_bag" defaultValue={row.kgPerBag} required />
              </Field>
              <Field label="Total sample kg">
                <NumberInput name="sample_allowance" defaultValue={row.sampleKg} />
              </Field>
              <Field label="Net kg">
                <output className={`${fieldClass} block bg-stone-50 text-right tabular-nums dark:bg-stone-900`}>
                  {row.netWt.toFixed(2)}
                </output>
              </Field>
              <Field label="Price/kg">
                <NumberInput name="price_per_kg" defaultValue={row.pricePerKg} />
              </Field>
              <Field label="Proceeds">
                <NumberInput name="proceeds" defaultValue={row.proceeds} />
              </Field>
              <Field label="VAT">
                <NumberInput name="vat_amount" defaultValue={row.vatAmount} />
              </Field>
              <Field label="Guarantee">
                <select
                  name="on_guarantee"
                  defaultValue={row.onGuarantee == null ? "" : row.onGuarantee ? "true" : "false"}
                  className={fieldClass}
                >
                  <option value="">Not sold</option>
                  <option value="false">Cash</option>
                  <option value="true">Guarantee</option>
                </select>
              </Field>
            </div>
          </fieldset>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <AppButton type="button" size="sm" onClick={onCancel}>Cancel</AppButton>
        <SubmitButton
          pendingText="Saving…"
          className="min-h-9 rounded-xl border-transparent bg-green-700 px-3 text-xs text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-500"
        >
          Save changes
        </SubmitButton>
      </div>
    </form>
  );
}

const fieldClass = "min-h-10 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-green-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-stone-600 dark:text-stone-300">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  name,
  defaultValue,
  required = false,
}: {
  name: string;
  defaultValue: string;
  required?: boolean;
}) {
  return <input name={name} defaultValue={defaultValue} required={required} className={fieldClass} />;
}

function NumberInput({
  name,
  defaultValue,
  step = "0.01",
  required = false,
}: {
  name: string;
  defaultValue: number | null;
  step?: string;
  required?: boolean;
}) {
  return (
    <input
      name={name}
      type="number"
      min="0"
      step={step}
      defaultValue={defaultValue ?? ""}
      required={required}
      className={`${fieldClass} text-right tabular-nums`}
    />
  );
}
