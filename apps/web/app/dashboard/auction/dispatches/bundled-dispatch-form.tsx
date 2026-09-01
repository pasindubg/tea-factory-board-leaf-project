"use client";

import { useState } from "react";
import { DetailLovField } from "@/components/detail-workspace";
import { SubmitButton } from "@/components/submit-button";
import { AppButton } from "@/components/ui/button";
import type {
  AuctionEligibleBrokerInvoiceListRow,
  AuctionWarehouseListRow,
} from "@/lib/list-resources";

export type EligibleBrokerInvoice = AuctionEligibleBrokerInvoiceListRow;
export type WarehouseOption = AuctionWarehouseListRow;

const inputClass = "mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-green-600 focus:outline-none dark:border-stone-600 dark:bg-stone-900 dark:focus:border-green-500";

/**
 * A physical dispatch's own attributes and nothing else — the date range it
 * covers and the warehouse it leaves from.
 *
 * It deliberately does NOT pick dispatch invoices. The lorry is booked before
 * anyone knows what goes on it, so requiring a load up front made an empty
 * dispatch impossible to open; invoices join a dispatch through their own
 * dispatch date instead.
 */
export function BundledDispatchForm({
  today,
  warehouses,
  action,
  onCancel,
}: {
  today: string;
  warehouses: WarehouseOption[];
  action: (formData: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [dispatchDateFrom, setDispatchDateFrom] = useState(today);
  const [dispatchDateTo, setDispatchDateTo] = useState(today);
  const [spansMultipleDates, setSpansMultipleDates] = useState(false);
  const effectiveDateTo = spansMultipleDates ? dispatchDateTo : dispatchDateFrom;
  const hasActiveWarehouse = warehouses.some((warehouse) => warehouse.active);
  const canSubmit = Boolean(dispatchDateFrom && effectiveDateTo && hasActiveWarehouse);

  return (
    <form action={action} className="space-y-5">
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

        <div>
          <DetailLovField
            label="Warehouse"
            source="auction.warehouses"
            name="warehouse_id"
            required
          />
          {!hasActiveWarehouse && (
            <span className="mt-1 block text-xs font-normal text-stone-500 dark:text-stone-400">
              Add an active warehouse in Warehouse Basic Data first.
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <AppButton type="button" onClick={onCancel}>Cancel</AppButton>
        <SubmitButton pendingText="Creating dispatch…" disabled={!canSubmit} className="border-transparent bg-green-700 text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-500">
          Create dispatch
        </SubmitButton>
      </div>
    </form>
  );
}
