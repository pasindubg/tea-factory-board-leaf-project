"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { formatSaleNo, saleNoMatches } from "./sale-number";

const input = "mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm";
const label = "block text-sm font-medium text-stone-600 dark:text-stone-400";

export type DispatchCreationOptions = {
  brokers: { id: string; name: string }[];
  marks: { id: string; code: string; name: string | null }[];
  invoiceDate: string;
  nextDispatchNo: string;
  dispatchHistory: { saleNo: string; targetSaleNo: string; dispatchDate: string | null; saleDate: string | null }[];
};

export function NewDispatchForm({
  brokers,
  marks,
  invoiceDate,
  nextDispatchNo,
  dispatchHistory,
  action,
  onCancel,
}: DispatchCreationOptions & {
  action: (formData: FormData) => void | Promise<void>;
  onCancel?: () => void;
}) {
  return (
    <form action={action} className="grid gap-4">
      <NewDispatchFields
        brokers={brokers}
        marks={marks}
        invoiceDate={invoiceDate}
        nextDispatchNo={nextDispatchNo}
        dispatchHistory={dispatchHistory}
      />
      <div className="flex flex-wrap gap-2">
        <SubmitButton
          pendingText="Creating…"
          className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
        >
          Create broker invoice
        </SubmitButton>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 dark:border-stone-600 dark:text-stone-200">Cancel</button>}
      </div>
    </form>
  );
}

export function NewDispatchFields({
  brokers,
  marks,
  invoiceDate,
  nextDispatchNo,
  dispatchHistory,
}: DispatchCreationOptions) {
  const [dispatchDate, setDispatchDate] = useState(invoiceDate);
  const [targetSaleNo, setTargetSaleNo] = useState("");
  const [saleDate, setSaleDate] = useState(addDays(invoiceDate, 14));

  useEffect(() => {
    const formattedSaleNo = formatSaleNo(targetSaleNo);
    const previousSameSale = dispatchHistory.find((dispatch) =>
      dispatch.saleDate && (
        saleNoMatches(dispatch.targetSaleNo, formattedSaleNo) ||
        saleNoMatches(dispatch.saleNo, formattedSaleNo)
      )
    );
    if (previousSameSale && targetSaleNo !== formattedSaleNo) setTargetSaleNo(formattedSaleNo);
    setSaleDate(previousSameSale?.saleDate ?? addDays(invoiceDate, 14));
  }, [dispatchHistory, invoiceDate, targetSaleNo]);

  if (brokers.length === 0 || marks.length === 0) {
    return (
      <Link
        href="/dashboard/auction/registry"
        className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
      >
        Add a broker and selling mark first
      </Link>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className={label}>Broker <span className="text-red-500">*</span></label>
          <select name="broker_id" required defaultValue="" className={input}>
            <option value="" disabled>Select broker</option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Selling mark <span className="text-red-500">*</span></label>
          <select name="selling_mark_id" required defaultValue="" className={input}>
            <option value="" disabled>Select selling mark</option>
            {marks.map((mark) => (
              <option key={mark.id} value={mark.id}>{mark.code}{mark.name ? ` — ${mark.name}` : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Broker lorry no. <span className="font-normal text-stone-400">(optional)</span></label>
          <input name="broker_lorry_no" placeholder="e.g. NP CAB-1234" className={input} />
        </div>
        <div>
          <label className={label}>Driver <span className="font-normal text-stone-400">(optional)</span></label>
          <input name="driver_name" placeholder="Driver name" className={input} />
        </div>
        <div>
          <label className={label}>Broker invoice number</label>
          <div className="mt-1 rounded-md border border-stone-300 dark:border-stone-600 bg-stone-50 dark:bg-stone-800 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">System generated</p>
                <p className="font-mono text-sm font-medium tabular-nums text-stone-800 dark:text-stone-200">{nextDispatchNo}</p>
              </div>
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-white/80 dark:bg-stone-900 px-2 py-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">
                Locked
              </span>
            </div>
          </div>
        </div>
        <div>
          <label className={label}>Sale number <span className="text-red-500">*</span></label>
          <input
            name="target_sale_no"
            required
            value={targetSaleNo}
            onChange={(event) => setTargetSaleNo(event.target.value)}
            onBlur={(event) => setTargetSaleNo(formatSaleNo(event.target.value))}
            placeholder="023"
            className={input}
          />
        </div>
        <div>
          <label className={label}>Dispatch date <span className="text-red-500">*</span></label>
          <input
            type="date"
            name="dispatch_date"
            required
            value={dispatchDate}
            onChange={(event) => setDispatchDate(event.target.value)}
            className={input}
          />
        </div>
        <div>
          <label className={label}>Sale date <span className="text-red-500">*</span></label>
          <input
            type="date"
            name="sale_date"
            required
            value={saleDate}
            onChange={(event) => setSaleDate(event.target.value)}
            className={input}
          />
        </div>
    </div>
  );
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return "";
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
