"use client";

import { EntityList, type EntityListColumn, type EntityListCommand } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { createInvoicePrefix, activateInvoicePrefix } from "../actions";
import { CATEGORY_LABEL, type InvoiceCategory } from "../invoice-number";

export type PrefixTableRow = {
  id: string;
  category: string;
  prefix: string;
  active: boolean;
  createdAt: string | null;
};

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";

const COLUMNS: EntityListColumn<PrefixTableRow>[] = [
  {
    key: "category",
    label: "Category",
    accessor: (row) => CATEGORY_LABEL[row.category as InvoiceCategory] ?? row.category,
    sortable: true,
    filter: "select",
    filterOptions: [
      { value: "broker_invoice", label: "Broker invoice" },
      { value: "regular_invoice", label: "Regular invoice" },
    ],
  },
  {
    key: "prefix",
    label: "Prefix",
    accessor: (row) => row.prefix,
    sortable: true,
    filter: "text",
    cellClassName: "font-mono font-medium",
  },
  {
    key: "active",
    label: "State",
    accessor: (row) => row.active ? "Active" : "Inactive",
    sortable: true,
    filter: "select",
    filterOptions: [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }],
    render: (row) => (
      <span className={`rounded-full px-2 py-0.5 text-xs ${row.active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
        {row.active ? "Active" : "Inactive"}
      </span>
    ),
  },
  {
    key: "createdAt",
    label: "Created",
    accessor: (row) => row.createdAt ?? "",
    sortable: true,
    render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—",
  },
];

const LIST: ListDefinition<PrefixTableRow> = {
  columns: COLUMNS,
  selectionMode: "single",
  add: true,
  edit: false,
  delete: false,
};

export function PrefixesTable({ rows, canManage }: { rows: PrefixTableRow[]; canManage: boolean }) {
  const commands: EntityListCommand<PrefixTableRow>[] = [{
    id: "activate",
    label: "Activate",
    pendingLabel: "Activating…",
    visible: canManage,
    disabled: ({ selectedRows }) => selectedRows.length !== 1 || selectedRows[0]?.active === true,
    disabledReason: ({ selectedRows }) => {
      if (selectedRows.length !== 1) return "Select exactly one prefix.";
      if (selectedRows[0]?.active) return "This prefix is already active.";
      return undefined;
    },
    confirm: {
      title: ({ selectedRows }) => `Activate ${selectedRows[0]?.prefix}?`,
      description: ({ selectedRows }) =>
        `New ${CATEGORY_LABEL[selectedRows[0]?.category as InvoiceCategory] ?? ""} entries will use ${selectedRows[0]?.prefix} from now on. The currently active prefix for this category will be deactivated.`,
      confirmLabel: "Activate",
    },
    run: async ({ selectedRows }) => activateInvoicePrefix(selectedRows[0]!.id),
  }];

  return (
    <EntityList
      resource={{ key: "auction.invoice-prefixes" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.prefix}
      title="Invoice number prefixes"
      description="Numbering books for broker invoices and regular (lot) invoices. Only one prefix per category can be active."
      emptyMessage="No prefixes yet."
      canCreate={canManage}
      create={{
        action: createInvoicePrefix,
        label: "New prefix",
        panelTitle: "Create invoice number prefix",
        disabledReason: canManage ? "Finish the current action first." : "Only owner, manager, or supervisor can create prefixes.",
        render: ({ action, close }) => (
          <form action={action} className="grid gap-3 sm:grid-cols-3">
            <select name="category" required defaultValue="" className={input}>
              <option value="" disabled>Choose category</option>
              <option value="broker_invoice">Broker invoice</option>
              <option value="regular_invoice">Regular invoice</option>
            </select>
            <div className="flex gap-2">
              <button type="button" onClick={close} className="shrink-0 rounded-md border border-stone-300 px-3 py-2 text-sm font-medium dark:border-stone-600">Cancel</button>
              <SubmitButton pendingText="Creating…" className="shrink-0 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700">Create</SubmitButton>
            </div>
          </form>
        ),
      }}
      commands={commands}
    />
  );
}
