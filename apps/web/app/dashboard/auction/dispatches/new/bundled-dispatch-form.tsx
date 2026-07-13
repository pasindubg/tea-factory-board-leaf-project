"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { createBundledDispatch } from "../../actions";

export type EligibleBrokerInvoice = {
  id: string;
  invoiceNo: string;
  broker: string;
  invoiceDate: string;
  lotCount: number;
  status: string;
};

export type WarehouseOption = { id: string; name: string; active: boolean };

export function BundledDispatchForm({ invoices, warehouses }: { invoices: EligibleBrokerInvoice[]; warehouses: WarehouseOption[] }) {
  const dates = useMemo(() => [...new Set(invoices.map((invoice) => invoice.invoiceDate))].sort().reverse(), [invoices]);
  const [dispatchDateFrom, setDispatchDateFrom] = useState(dates[0] ?? "");
  const [dispatchDateTo, setDispatchDateTo] = useState(dates[0] ?? "");
  const [spansMultipleDates, setSpansMultipleDates] = useState(false);
  const effectiveDateTo = spansMultipleDates ? dispatchDateTo : dispatchDateFrom;
  const visibleInvoices = invoices.filter((invoice) => invoice.invoiceDate >= dispatchDateFrom && invoice.invoiceDate <= effectiveDateTo);
  const canChooseWarehouse = visibleInvoices.length > 0;

  return (
    <form action={createBundledDispatch} className="mt-6 space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">Dispatch date from</label>
          <input
            type="date"
            name="dispatch_date_from"
            value={dispatchDateFrom}
            onChange={(event) => setDispatchDateFrom(event.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-900"
            required
          />
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 pt-1 text-sm font-medium text-stone-700 dark:text-stone-300">
            <input type="checkbox" checked={spansMultipleDates} onChange={(event) => { setSpansMultipleDates(event.target.checked); if (!event.target.checked) setDispatchDateTo(dispatchDateFrom); }} className="rounded border-stone-300 text-green-700 focus:ring-green-600" />
            Dispatch spans multiple dates
          </label>
          {!spansMultipleDates && <input type="hidden" name="dispatch_date_to" value={dispatchDateFrom} />}
          {spansMultipleDates && <>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">Dispatch date to</label>
          <input type="date" name="dispatch_date_to" value={dispatchDateTo} min={dispatchDateFrom} onChange={(event) => setDispatchDateTo(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-900" required />
          </>}
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">Warehouse</label>
          <select name="warehouse_id" required defaultValue="" disabled={!canChooseWarehouse} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-600 dark:bg-stone-900">
            <option value="" disabled>Select a warehouse…</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id} disabled={!warehouse.active}>
                {warehouse.name}{warehouse.active ? "" : " (Inactive)"}
              </option>
            ))}
          </select>
          {!canChooseWarehouse && <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Choose a date with invoices before selecting a warehouse.</p>}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 dark:border-stone-700">
        <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-700">
          <h3 className="font-semibold text-stone-800 dark:text-stone-100">Broker Invoices to bundle</h3>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Select two or more invoices dated from {dispatchDateFrom || "…"} to {effectiveDateTo || "…"}. Their lots remain beneath their original Broker Invoice.</p>
        </div>
        {visibleInvoices.length === 0 ? (
          <p className="px-4 py-8 text-sm text-stone-500 dark:text-stone-400">No eligible Broker Invoices in this date range.</p>
        ) : (
          <div className="divide-y divide-stone-200 dark:divide-stone-700">
            {visibleInvoices.map((invoice) => (
              <label key={invoice.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/60">
                <input type="checkbox" name="broker_invoice_id" value={invoice.id} className="h-4 w-4 rounded border-stone-300 text-green-700 focus:ring-green-600" />
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-sm font-semibold text-stone-800 dark:text-stone-100">{invoice.invoiceNo}</span>
                  <span className="ml-3 text-sm text-stone-600 dark:text-stone-300">{invoice.broker}</span>
                </span>
                <span className="text-xs text-stone-500 dark:text-stone-400">{invoice.lotCount} lot{invoice.lotCount === 1 ? "" : "s"} · {invoice.status}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <SubmitButton pendingText="Creating dispatch…" className="rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700">
        Create dispatch
      </SubmitButton>
    </form>
  );
}
