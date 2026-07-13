"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { SubmitButton } from "@/components/submit-button";
import { createDispatch } from "./actions";
import { formatSaleNo, saleNoMatches } from "./sale-number";

const input = "mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm";
const label = "block text-sm font-medium text-stone-600 dark:text-stone-400";

export function NewDispatchForm({
  brokers,
  nextDispatchNo,
  dispatchHistory,
}: {
  brokers: { id: string; name: string }[];
  nextDispatchNo: string;
  dispatchHistory: { saleNo: string; targetSaleNo: string; dispatchDate: string | null; saleDate: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const [targetSaleNo, setTargetSaleNo] = useState("");
  const [dispatchDate, setDispatchDate] = useState(today);
  const [saleDate, setSaleDate] = useState(addDays(today, 14));
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    const formattedSaleNo = formatSaleNo(targetSaleNo);
    const previousSameSale = dispatchHistory.find((dispatch) =>
      dispatch.saleDate && (
        saleNoMatches(dispatch.targetSaleNo, formattedSaleNo) ||
        saleNoMatches(dispatch.saleNo, formattedSaleNo)
      )
    );
    if (previousSameSale && targetSaleNo !== formattedSaleNo) setTargetSaleNo(formattedSaleNo);
    setSaleDate(previousSameSale?.saleDate ?? addDays(dispatchDate, 14));
  }, [dispatchDate, dispatchHistory, targetSaleNo]);

  if (brokers.length === 0) {
    return (
      <Link
        href="/dashboard/auction/registry"
        className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
      >
        Add a broker first
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
      >
        New broker invoice
      </button>
      <form
        ref={ref}
        action={createDispatch}
        className={`absolute right-0 top-12 z-20 w-96 grid gap-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 shadow-lg ${open ? "" : "hidden"}`}
      >
        <div>
          <label className={label}>Broker</label>
          <select name="broker_id" required defaultValue="" className={input}>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
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
          <label className={label}>Sale number</label>
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
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Invoice date <span className="text-red-500">*</span></label>
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
        <SubmitButton
          pendingText="Creating…"
          className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
        >
          Create broker invoice
        </SubmitButton>
      </form>
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
