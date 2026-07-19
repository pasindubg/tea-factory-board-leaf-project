"use client";

import Link from "next/link";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { AuctionDispatchListRow } from "@/lib/list-resources";
import { createDispatch, deleteSale, updateSale } from "./actions";
import { NewDispatchForm, type DispatchCreationOptions } from "./new-dispatch-form";
import { formatFourDigitNo, formatSaleNo, saleNoKey } from "./sale-number";

type SaleRow = AuctionDispatchListRow;

const STATE_PILL: Record<string, string> = {
  dispatched: "border-stone-200 bg-stone-100 text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300",
  draft: "border-stone-200 bg-stone-100 text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300",
  invoiced: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  grn: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  catalogued: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  valued: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  sold: "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
  settled: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  broker_statement: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
};

const ALL_STATES = ["draft", "invoiced", "grn", "catalogued"];
const editInputClass = "w-24 rounded border border-stone-300 px-2 py-1 text-xs outline-none focus:border-green-600 dark:border-stone-600 dark:bg-stone-800";

function dispatchDisplayStatus(status: string | null | undefined) {
  return ["valued", "sold", "settled", "broker_statement"].includes(status ?? "")
    ? "catalogued"
    : (status ?? "draft");
}

const COLUMNS: EntityListColumn<SaleRow>[] = [
  {
    key: "sale_no",
    label: "Broker invoice no.",
    accessor: (row) => row.sale_no,
    sortable: true,
    filter: "text",
    render: (row) => (
      <Link href={`/dashboard/auction/${row.id}`} className="font-medium text-green-700 hover:underline dark:text-green-400">
        {row.sale_no}
      </Link>
    ),
  },
  { key: "broker", label: "Broker", accessor: (row) => row.brokers?.name ?? null, sortable: true, filter: "select" },
  { key: "selling_mark", label: "Selling mark", accessor: (row) => row.selling_mark, sortable: true, filter: "text" },
  { key: "broker_lorry_no", label: "Lorry no.", accessor: (row) => row.broker_lorry_no, sortable: true, filter: "text" },
  { key: "driver_name", label: "Driver", accessor: (row) => row.driver_name, sortable: true, filter: "text" },
  {
    key: "bundle_dispatch_no",
    label: "Dispatch no.",
    accessor: (row) => row.bundle_dispatch_no,
    sortable: true,
    filter: "text",
    cellClassName: "font-mono",
  },
  {
    key: "target_sale_no",
    label: "Target sale",
    accessor: (row) => row.target_sale_no ?? null,
    sortable: true,
    filter: "text",
    render: (row) => formatSaleNo(row.target_sale_no) || <span className="text-stone-300 dark:text-stone-600">—</span>,
    edit: (row, { formId }) => (
      <input
        form={formId}
        name="target_sale_no"
        defaultValue={formatSaleNo(row.target_sale_no)}
        onBlur={(event) => {
          event.currentTarget.value = formatSaleNo(event.currentTarget.value);
        }}
        className={editInputClass}
        placeholder="—"
      />
    ),
  },
  { key: "created_date", label: "Created date", accessor: (row) => row.created_date, sortable: true, searchInput: "date", cellClassName: "whitespace-nowrap text-xs text-stone-500 dark:text-stone-400" },
  { key: "dispatch_date", label: "Invoice date", accessor: (row) => row.dispatch_date ?? null, sortable: true, searchInput: "date", cellClassName: "whitespace-nowrap text-xs text-stone-500 dark:text-stone-400" },
  { key: "sale_date", label: "Sale date", accessor: (row) => row.sale_date ?? null, sortable: true, searchInput: "date", cellClassName: "whitespace-nowrap text-xs text-stone-500 dark:text-stone-400" },
  { key: "prompt_date", label: "Prompt", accessor: (row) => row.prompt_date ?? null, sortable: true, searchInput: "date", cellClassName: "whitespace-nowrap text-xs text-stone-500 dark:text-stone-400" },
  {
    key: "status",
    label: "Status",
    accessor: (row) => dispatchDisplayStatus(row.status),
    sortable: true,
    filter: "select",
    filterOptions: ALL_STATES.map((state) => ({ value: state, label: state })),
    render: (row) => {
      const status = dispatchDisplayStatus(row.status);
      return (
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATE_PILL[status] ?? STATE_PILL.draft}`}
          title={row.status !== status ? `Saved status: ${row.status}` : status}
        >
          {status}
        </span>
      );
    },
  },
];

async function deleteBrokerInvoices(ids: string[]): Promise<ListMutationResult> {
  let succeeded = 0;
  const failures: string[] = [];
  for (const id of ids) {
    const result = await deleteSale(id);
    if (result.ok) succeeded += 1;
    else failures.push(result.error);
  }
  if (succeeded === 0) {
    return { ok: false, error: failures[0] ?? "No broker invoices were deleted." };
  }
  return {
    ok: true,
    notice: `${succeeded} broker invoice${succeeded === 1 ? "" : "s"} deleted${failures.length ? `; ${failures.length} could not be deleted` : ""}.`,
  };
}

export function DispatchesTable({
  initialRows,
  isOwner,
  creation,
}: {
  initialRows: SaleRow[];
  isOwner: boolean;
  creation: DispatchCreationOptions;
}) {
  const definition: ListDefinition<SaleRow> = {
    columns: COLUMNS,
    selectionMode: isOwner ? "multi" : "single",
    add: true,
    edit: isOwner,
    delete: isOwner,
  };

  return (
    <EntityList
      resource={{ key: "auction.dispatches" }}
      initialRows={initialRows}
      definition={definition}
      getId={(row) => row.id}
      rowLabel={(row) => row.sale_no ?? "broker invoice"}
      title="Invoice Overview"
      description={(rows) => `${rows.length} broker invoice${rows.length === 1 ? "" : "s"}`}
      emptyMessage="No broker invoices yet."
      filteredEmptyMessage="No broker invoices match these filters."
      canCreate
      create={{
        action: createDispatch,
        label: "New broker invoice",
        panelTitle: "New broker invoice",
        disabledReason: "Finish the current broker-invoice action first.",
        render: ({ action, close, rows }) => {
          const latestSaleNo = rows.reduce(
            (maximum, row) => Math.max(maximum, Number(saleNoKey(row.sale_no)) || 0),
            0,
          );
          const nextDispatchNo = formatFourDigitNo(
            Math.max(Number(saleNoKey(creation.nextDispatchNo)) || 0, latestSaleNo + 1),
          );
          return (
            <NewDispatchForm
              {...creation}
              nextDispatchNo={nextDispatchNo}
              dispatchHistory={rows.map((row) => ({
                saleNo: row.sale_no,
                targetSaleNo: row.target_sale_no,
                dispatchDate: row.dispatch_date,
                saleDate: row.sale_date,
              }))}
              action={action}
              onCancel={close}
            />
          );
        },
      }}
      edit={isOwner ? {
        action: (row, formData) => updateSale(row.id, formData),
        label: "Edit",
        saveLabel: "Save changes",
      } : undefined}
      canDelete={isOwner}
      deleteAction={isOwner ? {
        action: deleteBrokerInvoices,
        title: (count) => `Delete ${count} broker invoice${count === 1 ? "" : "s"}?`,
        description: () => "This permanently removes the selected broker invoices and their operational child records. Financial history blocks deletion.",
        confirmLabel: "Delete",
      } : undefined}
    />
  );
}
