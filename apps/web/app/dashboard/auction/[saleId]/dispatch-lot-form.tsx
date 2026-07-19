"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { formatFourDigitNo } from "../sale-number";

const input = "mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm";
const label = "block text-sm font-medium text-stone-600 dark:text-stone-400";

export function DispatchLotForm({
  action,
  grades,
  open,
  onCancel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  grades: { code: string; name: string }[];
  open: boolean;
  onCancel: () => void;
}) {
  const [invoiceCount, setInvoiceCount] = useState(1);
  if (!open) return null;

  return (
    <form action={action} className="grid gap-3">
        <div>
          <label className={label}>Invoice no.</label>
          {Array.from({ length: invoiceCount }).map((_, i) => (
            <input
              key={i}
              name="invoice_no"
              required={i === 0}
              placeholder={i === 0 ? "0058" : "another invoice (rare)"}
              onBlur={(event) => {
                event.currentTarget.value = formatFourDigitNo(event.currentTarget.value);
              }}
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
        <div>
          <label className={label}>Lot no.</label>
          <input
            name="lot_no"
            placeholder="optional"
            onBlur={(event) => {
              event.currentTarget.value = formatFourDigitNo(event.currentTarget.value);
            }}
            className={input}
          />
        </div>
        <div>
          <label className={label}>Grade</label>
          <select name="grade" required defaultValue="" className={`${input} appearance-none`}>
            <option value="" disabled>
              Choose grade
            </option>
            {grades.map((grade) => (
              <option key={grade.code} value={grade.code}>
                {grade.code}
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
        <div>
          <label className={label}>Sample kg</label>
          <input name="sample_allowance" type="number" min="0" step="0.01" placeholder="0.00" className={input} />
        </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton
          pendingText="Adding…"
          className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
        >
          Add lot
        </SubmitButton>
        <button type="button" onClick={onCancel} className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 dark:border-stone-600 dark:text-stone-200">
          Cancel
        </button>
      </div>
    </form>
  );
}
