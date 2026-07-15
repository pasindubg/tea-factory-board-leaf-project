"use client";

import { useMemo, useState } from "react";
import {
  ListCommandToolbar,
  ListSearchPanel,
  ListSelectionCell,
  ListSelectionHeader,
  ListSurface,
  SortButton,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { AppButton } from "@/components/ui/button";
import type {
  AuctionEligibleBrokerInvoiceListRow,
  AuctionWarehouseListRow,
} from "@/lib/list-resources";

export type EligibleBrokerInvoice = AuctionEligibleBrokerInvoiceListRow;
export type WarehouseOption = AuctionWarehouseListRow;

const INVOICE_COLUMNS: ColumnDef<EligibleBrokerInvoice>[] = [
  { key: "invoiceNo", label: "Invoice no.", accessor: (row) => row.invoiceNo, sortable: true, filter: "text", lov: false },
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select" },
  { key: "invoiceDate", label: "Invoice date", accessor: (row) => row.invoiceDate, sortable: true, lov: false, searchInput: "date" },
  { key: "lotCount", label: "Lots", accessor: (row) => row.lotCount, sortable: true, lov: false, searchInput: "number" },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select" },
];

const INVOICE_LIST = {
  columns: INVOICE_COLUMNS,
  selectionMode: "multi",
  add: false,
  edit: false,
  delete: false,
} satisfies ListDefinition<EligibleBrokerInvoice>;

const inputClass = "mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-green-600 focus:outline-none dark:border-stone-600 dark:bg-stone-900 dark:focus:border-green-500";

export function BundledDispatchForm({
  invoices,
  warehouses,
  action,
  onCancel,
}: {
  invoices: EligibleBrokerInvoice[];
  warehouses: WarehouseOption[];
  action: (formData: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const dates = useMemo(
    () => [...new Set(invoices.map((invoice) => invoice.invoiceDate).filter(Boolean))].sort().reverse(),
    [invoices],
  );
  const [dispatchDateFrom, setDispatchDateFrom] = useState(dates[0] ?? "");
  const [dispatchDateTo, setDispatchDateTo] = useState(dates[0] ?? "");
  const [spansMultipleDates, setSpansMultipleDates] = useState(false);
  const effectiveDateTo = spansMultipleDates ? dispatchDateTo : dispatchDateFrom;
  const dateRows = useMemo(
    () => invoices.filter((invoice) => invoice.invoiceDate >= dispatchDateFrom && invoice.invoiceDate <= effectiveDateTo),
    [dispatchDateFrom, effectiveDateTo, invoices],
  );
  const controls = useListControls(dateRows, INVOICE_LIST.columns);
  const selection = useListSelection(dateRows, { mode: INVOICE_LIST.selectionMode, getId: (row) => row.id });
  const visibleRows = controls.rows;
  const eligibleIds = useMemo(() => new Set(dateRows.map((invoice) => invoice.id)), [dateRows]);
  const selectedIds = [...selection.selectedIds].filter((id) => eligibleIds.has(id));
  const canSubmit = Boolean(dispatchDateFrom && effectiveDateTo && selectedIds.length >= 2 && warehouses.some((warehouse) => warehouse.active));

  return (
    <form action={action} className="space-y-5">
      {selectedIds.map((id) => <input key={id} type="hidden" name="broker_invoice_id" value={id} />)}
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
          Dispatch date from <span aria-hidden="true" className="text-red-600">*</span>
          <input
            type="date"
            name="dispatch_date_from"
            value={dispatchDateFrom}
            onChange={(event) => {
              const value = event.target.value;
              setDispatchDateFrom(value);
              if (!spansMultipleDates || dispatchDateTo < value) setDispatchDateTo(value);
            }}
            className={inputClass}
            required
          />
        </label>

        <div className="space-y-2">
          <label className="flex items-center gap-2 pt-1 text-sm font-medium text-stone-700 dark:text-stone-300">
            <input
              type="checkbox"
              checked={spansMultipleDates}
              onChange={(event) => {
                setSpansMultipleDates(event.target.checked);
                if (!event.target.checked) setDispatchDateTo(dispatchDateFrom);
              }}
              className="rounded border-stone-300 text-green-700 focus:ring-green-600"
            />
            Dispatch spans multiple dates
          </label>
          {!spansMultipleDates && <input type="hidden" name="dispatch_date_to" value={dispatchDateFrom} />}
          {spansMultipleDates && (
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
              Dispatch date to <span aria-hidden="true" className="text-red-600">*</span>
              <input
                type="date"
                name="dispatch_date_to"
                value={dispatchDateTo}
                min={dispatchDateFrom}
                onChange={(event) => setDispatchDateTo(event.target.value)}
                className={inputClass}
                required
              />
            </label>
          )}
        </div>

        <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
          Warehouse <span aria-hidden="true" className="text-red-600">*</span>
          <select name="warehouse_id" required defaultValue="" disabled={dateRows.length === 0} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-50`}>
            <option value="" disabled>Select a warehouse…</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id} disabled={!warehouse.active}>
                {warehouse.name}{warehouse.active ? "" : " (Inactive)"}
              </option>
            ))}
          </select>
          {dateRows.length === 0 && <span className="mt-1 block text-xs font-normal text-stone-500 dark:text-stone-400">Choose a date range containing eligible invoices first.</span>}
        </label>
      </div>

      <ListSurface
        title="Eligible Broker Invoices"
        description={`Select at least two unbundled invoices dated from ${dispatchDateFrom || "…"} to ${effectiveDateTo || "…"}. Their lots remain beneath their original Broker Invoice.`}
      >
        <ListCommandToolbar mode={INVOICE_LIST.selectionMode} count={selectedIds.length} />
        <ListSearchPanel columns={INVOICE_LIST.columns} controls={controls} label="Find eligible Broker Invoices" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
                <ListSelectionHeader
                  mode={INVOICE_LIST.selectionMode}
                  scope="eligible-broker-invoices"
                  checked={selection.allVisibleSelected(visibleRows)}
                  onChange={() => selection.toggleVisible(visibleRows)}
                />
                {INVOICE_LIST.columns.map((column) => (
                  <th key={column.key} className={`px-4 py-3 ${column.key === "lotCount" ? "text-right" : ""}`}>
                    {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((invoice) => (
                <tr
                  key={invoice.id}
                  {...selection.rowProps(invoice.id)}
                  className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(invoice.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
                >
                  <ListSelectionCell
                    mode={INVOICE_LIST.selectionMode}
                    scope="eligible-broker-invoices"
                    id={invoice.id}
                    label={`Broker Invoice ${invoice.invoiceNo}`}
                    checked={selection.isSelected(invoice.id)}
                    onChange={() => selection.toggle(invoice.id)}
                    name="invoice_selector"
                  />
                  <td className="px-4 py-3 font-mono font-semibold">{invoice.invoiceNo}</td>
                  <td className="px-4 py-3">{invoice.broker}</td>
                  <td className="px-4 py-3 tabular-nums">{invoice.invoiceDate}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{invoice.lotCount}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-300">{invoice.status}</span></td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={INVOICE_LIST.columns.length + 1} className="px-4 py-8 text-center text-stone-500 dark:text-stone-400">
                    {dateRows.length === 0 ? "No eligible Broker Invoices in this date range." : "No eligible Broker Invoices match these filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ListSurface>

      <div className="flex flex-wrap justify-end gap-2">
        <AppButton type="button" onClick={onCancel}>Cancel</AppButton>
        <SubmitButton pendingText="Creating dispatch…" disabled={!canSubmit} className="border-transparent bg-green-700 text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-500">
          Create dispatch
        </SubmitButton>
      </div>
    </form>
  );
}
