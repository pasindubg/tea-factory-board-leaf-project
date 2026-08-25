"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { LovCombobox } from "@/components/lov-combobox";
import { displayInvoiceNo, useInvoicePrefix } from "@/components/invoice-prefix";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { AuctionInvoiceOverviewListRow } from "@/lib/list-resources";
import { createInvoiceFromOverview, deleteLot, updateLot } from "../actions";
import { BROKER_INVOICE_STATUSES, isOpenDraft, stateBucket, stateBucketOptions } from "../state-buckets";
import { LOT_STATES } from "../lot-states";
import { formatSaleNo } from "../sale-number";
import { NewInvoiceRow, type GradeOption, type NewInvoiceDefaults } from "./new-invoice-row";

export type InvoiceOverviewRow = AuctionInvoiceOverviewListRow;

const inputClass = "w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900";

/**
 * Keeps a value on a single line. The column is given room to fit the common
 * case outright; anything longer is clipped with an ellipsis rather than
 * wrapping, because a wrapped cell grows the height of the whole row. The full
 * text stays available through the native tooltip on hover.
 */
function OneLine({ value }: { value: string | null }) {
  const text = value ?? "—";
  return <span className="block truncate" title={text}>{text}</span>;
}

/**
 * An invoice may be changed while its broker invoice is still an open draft;
 * after that only the owner may touch it. Identical to the rule the broker
 * invoice detail page applies, and to what the server independently enforces
 * in lots.ts (dispatchEditError for updates, an inline check in deleteLot) —
 * this only decides what the table offers.
 */
/** Invoice number as one line, with the prefix shown or hidden per preference. */
function InvoiceNo({ value }: { value: string | null }) {
  const { visible } = useInvoicePrefix();
  return <OneLine value={displayInvoiceNo(value, visible) || null} />;
}

function isMutable(row: InvoiceOverviewRow, isOwner: boolean) {
  return isOwner || isOpenDraft(row.biStatus);
}

/**
 * The "Check" marker. Derived from the lot's own state rather than stored:
 * sold lots are ticked, re-prints are labelled as such. Add an entry here to
 * introduce a new marker — anything unmapped simply shows a dash.
 */
function checkMarker(row: { state: string | null; reprint: boolean }) {
  if (row.reprint) return "Reprint";
  return row.state === "sold" ? "Y" : "—";
}

/**
 * Column order is the one the factory's existing invoice sheet uses, so the
 * screen can be read against the paper it replaces. The broker invoice link,
 * lot state and BI state follow after it: they are not on that sheet, but the
 * BI state is what decides whether a row may still be edited, so hiding it
 * would make the locking rules look arbitrary.
 */
function columns(canEdit: boolean, isOwner: boolean): EntityListColumn<InvoiceOverviewRow>[] {
  // Per-row gate: a locked row keeps showing its value instead of an input, so
  // a confirmed broker invoice cannot be edited from here by a non-owner.
  const cell = (
    row: InvoiceOverviewRow,
    display: ReactNode,
    field: () => ReactNode,
  ) => (canEdit && isMutable(row, isOwner) ? field() : <span className="text-stone-500 dark:text-stone-400">{display}</span>);

  const num = (value: number | null | undefined) => (value != null ? value.toFixed(2) : "—");

  return [
    {
      key: "dispatchDate",
      label: "Dispatch Date",
      accessor: (row) => row.dispatchDate,
      sortable: true,
      lov: false,
      searchInput: "date",
      // Wide enough for the header and a full yyyy-mm-dd without wrapping.
      headerClassName: "whitespace-nowrap",
      cellClassName: "tabular-nums whitespace-nowrap min-w-36",
      render: (row) => row.dispatchDate ?? "—",
    },
    {
      key: "saleDate",
      label: "Sale Date (Planned)",
      accessor: (row) => row.saleDate,
      sortable: true,
      lov: false,
      searchInput: "date",
      headerClassName: "whitespace-nowrap",
      cellClassName: "tabular-nums whitespace-nowrap min-w-36",
      render: (row) => row.saleDate ?? "—",
    },
    { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select", lovSource: "auction.brokers" },
    {
      key: "invoiceNo",
      label: "Invoice No.",
      accessor: (row) => row.invoiceNo,
      sortable: true,
      filter: "text",
      prefixColumn: true,
      headerClassName: "whitespace-nowrap",
      cellClassName: "font-medium min-w-32 max-w-40",
      render: (row) => <InvoiceNo value={row.invoiceNo} />,
      edit: (row, { formId }) => cell(row, <OneLine value={row.invoiceNo} />, () => (
        <input form={formId} name="invoice_no" defaultValue={row.invoiceNo} className={inputClass} />
      )),
    },
    {
      key: "bags",
      label: "Bags",
      accessor: (row) => row.bags,
      sortable: true,
      lov: false,
      searchInput: "number",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (row) => row.bags ?? "—",
      edit: (row, { formId }) => cell(row, row.bags ?? "—", () => (
        <input form={formId} name="bags" type="number" min="1" defaultValue={row.bags ?? ""} className={`${inputClass} text-right`} />
      )),
    },
    {
      key: "grade",
      label: "Grade",
      accessor: (row) => row.grade,
      sortable: true,
      filter: "select",
      lovSource: "auction.grades",
      render: (row) => row.grade ?? "—",
      // Keeps an explicit editor (unlike the broker-invoice lot list, which
      // just declares lovSource) because `cell` gates editing per row: a
      // confirmed broker invoice's lot is owner-only.
      edit: (row, { formId }) => cell(row, row.grade ?? "—", () => (
        <LovCombobox
          source="auction.grades"
          name="grade"
          formId={formId}
          defaultValue={row.grade ?? ""}
          defaultLabel={row.grade ?? ""}
          ariaLabel="Grade"
          className={inputClass}
        />
      )),
    },
    {
      key: "kgPerBag",
      label: "Weight / Bag",
      accessor: (row) => row.kgPerBag,
      sortable: true,
      lov: false,
      searchInput: "number",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (row) => num(row.kgPerBag),
      edit: (row, { formId }) => cell(row, num(row.kgPerBag), () => (
        <input form={formId} name="kg_per_bag" type="number" step="0.01" min="0" defaultValue={row.kgPerBag ?? ""} className={`${inputClass} text-right`} />
      )),
    },
    {
      key: "sampleKg",
      label: "Sample Weight",
      accessor: (row) => row.sampleKg,
      sortable: true,
      lov: false,
      searchInput: "number",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (row) => num(row.sampleKg),
      edit: (row, { formId }) => cell(row, num(row.sampleKg), () => (
        <input form={formId} name="sample_allowance" type="number" step="0.01" min="0" defaultValue={row.sampleKg ?? ""} className={`${inputClass} text-right`} />
      )),
    },
    {
      key: "netWt",
      label: "Net Weight",
      accessor: (row) => row.netWt,
      sortable: true,
      lov: false,
      searchInput: "number",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums font-medium",
      render: (row) => num(row.netWt),
    },
    {
      key: "sellingMark",
      label: "Mark",
      accessor: (row) => row.sellingMark,
      sortable: true,
      filter: "select",
      lovSource: "auction.marks",
      headerClassName: "whitespace-nowrap",
      cellClassName: "min-w-44 max-w-56",
      render: (row) => <OneLine value={row.sellingMark} />,
    },
    {
      key: "allWeight",
      label: "All weight",
      accessor: (row) => row.allWeight,
      sortable: true,
      lov: false,
      searchInput: "number",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (row) => num(row.allWeight),
    },
    {
      key: "saleNo",
      label: "Sale No.",
      accessor: (row) => row.saleNo,
      sortable: true,
      filter: "text",
      render: (row) => row.saleNo ?? "—",
      // This is the broker invoice's own target_sale_no, shared by every lot
      // under it (see auction.invoice-overview in list-resource-registry.ts) —
      // saving here renames the sale number for the whole broker invoice, not
      // just this one lot row.
      edit: (row, { formId }) => cell(row, row.saleNo ?? "—", () => (
        <input
          form={formId}
          name="target_sale_no"
          defaultValue={row.saleNo ?? ""}
          title="Changes the sale number for the whole broker invoice this lot belongs to."
          onBlur={(event) => { event.currentTarget.value = formatSaleNo(event.currentTarget.value); }}
          className={inputClass}
        />
      )),
    },
    {
      key: "nextSaleNo",
      label: "Next Sale No.",
      accessor: (row) => row.nextSaleNo,
      sortable: true,
      filter: "text",
      render: (row) => row.nextSaleNo ?? "—",
    },
    {
      key: "previousSaleNo",
      label: "Previous Sale No.",
      accessor: (row) => row.previousSaleNo,
      sortable: true,
      filter: "text",
      render: (row) => row.previousSaleNo ?? "—",
    },
    {
      key: "check",
      label: "Check",
      accessor: (row) => checkMarker(row),
      sortable: true,
      filter: "select",
      render: (row) => checkMarker(row),
    },
    {
      key: "lotNo",
      label: "Lot No.",
      accessor: (row) => row.lotNo,
      sortable: true,
      filter: "text",
      render: (row) => row.lotNo ?? "—",
      edit: (row, { formId }) => cell(row, row.lotNo ?? "—", () => (
        <input form={formId} name="lot_no" defaultValue={row.lotNo ?? ""} className={inputClass} />
      )),
    },
    // ---- Not on the paper sheet, kept after it ----
    {
      key: "brokerInvoiceNo",
      label: "Broker invoice",
      accessor: (row) => row.brokerInvoiceNo,
      sortable: true,
      filter: "text",
      headerClassName: "whitespace-nowrap",
      cellClassName: "min-w-32 max-w-40",
      render: (row) => (
        <Link
          href={`/dashboard/auction/${row.saleId}`}
          title={row.brokerInvoiceNo || "—"}
          className="block truncate font-medium text-green-700 hover:underline dark:text-green-400"
        >
          {row.brokerInvoiceNo || "—"}
        </Link>
      ),
    },
    {
      key: "state",
      label: "Lot state",
      accessor: (row) => stateBucket(row.state).label,
      sortable: true,
      filter: "select",
      filterOptions: stateBucketOptions(LOT_STATES),
      render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${stateBucket(row.state).style}`}>{stateBucket(row.state).label}</span>,
    },
    {
      key: "shutout",
      label: "Shutout",
      accessor: (row) => row.shutout,
      boolean: true,
      sortable: true,
      filter: "select",
    },
    {
      key: "shutoutReason",
      label: "Shutout reason",
      accessor: (row) => row.shutoutReason ?? null,
      sortable: true,
      filter: "text",
      lov: false,
      cellClassName: "text-xs text-stone-500 dark:text-stone-400",
      render: (row) => row.shutoutReason ?? "—",
    },
    {
      key: "unsold",
      label: "Un-sold",
      accessor: (row) => row.unsold,
      boolean: true,
      sortable: true,
      filter: "select",
    },
    {
      key: "reprint",
      label: "Re-print",
      accessor: (row) => row.reprint,
      boolean: true,
      sortable: true,
      filter: "select",
    },
    {
      key: "biStatus",
      label: "BI state",
      accessor: (row) => stateBucket(row.biStatus).label,
      sortable: true,
      filter: "select",
      filterOptions: stateBucketOptions(BROKER_INVOICE_STATUSES),
      render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${stateBucket(row.biStatus).style}`}>{stateBucket(row.biStatus).label}</span>,
    },
  ];
}

/** Each invoice deletes through its own broker invoice, so this fans out. */
async function deleteInvoices(ids: string[], rows: InvoiceOverviewRow[]): Promise<ListMutationResult> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const failures: string[] = [];
  let succeeded = 0;
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      failures.push("A selected invoice is no longer in the list.");
      continue;
    }
    const result = await deleteLot(id, row.saleId);
    if (result.ok) succeeded += 1;
    else failures.push(result.error);
  }
  if (succeeded === 0) return { ok: false, error: failures[0] ?? "No invoices were deleted." };
  return {
    ok: true,
    notice: `${succeeded} invoice${succeeded === 1 ? "" : "s"} deleted${failures.length ? `; ${failures.length} could not be deleted` : ""}.`,
    invalidate: [{ kind: "all", key: "auction.invoice-overview" }, { kind: "all", key: "auction.dispatches" }],
  };
}

export function InvoiceOverviewTable({
  rows,
  isOwner,
  canEdit,
  canCreate,
  grades,
  defaults,
}: {
  rows: InvoiceOverviewRow[];
  isOwner: boolean;
  canEdit: boolean;
  canCreate: boolean;
  defaults: NewInvoiceDefaults;
  grades: GradeOption[];
}) {
  const definition: ListDefinition<InvoiceOverviewRow> = {
    columns: columns(canEdit, isOwner),
    selectionMode: canEdit ? "multi" : "single",
    add: canCreate,
    edit: canEdit,
    delete: canEdit,
  };

  const locked = (selected: InvoiceOverviewRow[]) => selected.filter((row) => !isMutable(row, isOwner));

  return (
    <EntityList
      resource={{ key: "auction.invoice-overview" }}
      initialRows={rows}
      definition={definition}
      getId={(row) => row.id}
      rowLabel={(row) => `invoice ${row.invoiceNo || row.id}`}
      description={(all) => {
        const net = all.reduce((sum, row) => sum + Number(row.netWt ?? 0), 0);
        return `${all.length} invoice${all.length === 1 ? "" : "s"} · ${net.toFixed(2)} kg net`;
      }}
      emptyMessage="No lot invoices yet. Use New invoice to add one."
      filteredEmptyMessage="No invoices match these filters."
      canCreate={canCreate}
      create={canCreate ? {
        action: createInvoiceFromOverview,
        label: "New invoice",
        renderRow: ({ formId }) => (
          <NewInvoiceRow formId={formId} grades={grades} defaults={defaults} />
        ),
      } : undefined}
      createPlacement="toolbar"
      edit={canEdit ? {
        action: (row, formData) => updateLot(row.id, row.saleId, formData),
        label: "Edit",
        saveLabel: "Save changes",
      } : undefined}
      canDelete={canEdit}
      deleteAction={canEdit ? {
        action: (ids, rows) => deleteInvoices(ids, rows),
        disabled: (selected) => locked(selected).length > 0,
        disabledReason: (selected) => locked(selected).length > 0
          ? "Only the owner can delete an invoice after its broker invoice is confirmed."
          : undefined,
        title: (count) => `Delete ${count} invoice${count === 1 ? "" : "s"}?`,
        description: () => "The lot and its invoice records are removed. Financial sale or VAT records safely block deletion. This cannot be undone.",
        confirmLabel: "Delete",
      } : undefined}
    />
  );
}
