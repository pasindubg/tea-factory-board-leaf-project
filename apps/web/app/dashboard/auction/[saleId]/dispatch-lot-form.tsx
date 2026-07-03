"use client";

import { useState, useRef, useEffect } from "react";
import { SubmitButton } from "@/components/submit-button";

const GRADES = ["OP", "OP1", "OPA", "PEK", "PEK1", "BOP", "BOPF", "FBOP", "DUST", "BM"];
const input = "mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm";
const label = "block text-sm font-medium text-stone-600 dark:text-stone-400";

export function DispatchLotForm({
  action,
  marks,
}: {
  action: (formData: FormData) => void | Promise<void>;
  marks: { id: string; code: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [invoiceCount, setInvoiceCount] = useState(1);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
      >
        + Add lot
      </button>
      <form
        ref={ref}
        action={action}
        className={`absolute right-0 top-10 z-20 w-96 grid gap-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 shadow-lg ${open ? "" : "hidden"}`}
      >
        <div>
          <label className={label}>Invoice no.</label>
          {Array.from({ length: invoiceCount }).map((_, i) => (
            <input
              key={i}
              name="invoice_no"
              required={i === 0}
              placeholder={i === 0 ? "0058" : "another invoice (rare)"}
              className={input}
            />
          ))}
          <button
            type="button"
            onClick={() => setInvoiceCount((n) => n + 1)}
            className="mt-1 text-xs text-green-700 dark:text-green-400 hover:underline"
          >
            + add another invoice
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Lot no.</label>
            <input name="lot_no" placeholder="optional" className={input} />
          </div>
          <div>
            <label className={label}>Mark</label>
            <select name="mark_id" className={`${input} appearance-none`} defaultValue="">
              <option value="">Choose mark</option>
              {marks.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={label}>Grade</label>
          <select name="grade" required defaultValue="" className={`${input} appearance-none`}>
            <option value="" disabled>
              Choose grade
            </option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Pick the grade from the factory’s standard set.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Bags</label>
            <input name="bags" type="number" min="1" step="1" required placeholder="10" className={input} />
          </div>
          <div>
            <label className={label}>kg/bag</label>
            <input name="kg_per_bag" type="number" min="0" step="0.01" required placeholder="28" className={input} />
          </div>
        </div>
        <SubmitButton
          pendingText="Adding…"
          className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
        >
          Add lot
        </SubmitButton>
      </form>
    </div>
  );
}
