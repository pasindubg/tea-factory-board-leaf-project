"use client";

import { useState } from "react";
import { LovCombobox } from "@/components/lov-combobox";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";

/**
 * Broker and mark are no longer passed in as fixed option lists — those
 * pickers are `LovCombobox`es querying the server as the user types, so they
 * keep working once a factory has more of them than a dropdown can show.
 * Grades stay a passed-in list: it is small and bounded per factory, and the
 * row needs each grade's configured sample weight locally to auto-fill it.
 */
export type GradeOption = { code: string; name: string; sampleWeight: number | null; defaultKgPerBag: number | null };

/**
 * Dispatch date, sale date, and sale no. are all pre-filled from the most
 * recent dispatch invoice, and every one stays editable.
 */
export type NewInvoiceDefaults = {
  dispatchDate: string | null;
  saleDate: string | null;
  saleNo: string | null;
};

const cellInput = "w-full min-w-24 rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900";
// Wide enough for a whole yyyy-mm-dd plus the native date picker glyph, so the
// control never wraps onto a second line.
const dateInput = "w-full min-w-40 rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900";
const muted = "text-xs text-stone-400 dark:text-stone-500";

/**
 * The draft row rendered inside the list when "New invoice" is pressed. Its
 * cells are in the same order as the table's columns so the entry lines up
 * under its own headers.
 *
 * Broker, mark and dispatch date decide which dispatch invoice the row joins;
 * sale no. and sale date are only used when no dispatch invoice is open for that
 * combination yet and one has to be created.
 *
 * Broker is optional: left blank, the row joins the IMB placeholder invoice
 * for that mark and date, and is moved onto a real broker's invoice from
 * there (see the invoice detail page's "Add to a broker").
 */
export function NewInvoiceRow({
  formId,
  grades,
  defaults,
  hideDispatchDate = false,
  bundledDispatchId,
}: {
  formId: string;
  grades: GradeOption[];
  defaults: NewInvoiceDefaults;
  /** The dispatch this list belongs to — the invoice is created inside it. */
  bundledDispatchId?: string;
  /** The list dropped its Dispatch date column, so this row drops the cell —
   * the value still submits (hidden), because it decides which dispatch invoice
   * the new lot invoice joins. */
  hideDispatchDate?: boolean;
}) {
  const [bags, setBags] = useState("10");
  const [kgPerBag, setKgPerBag] = useState("");
  const [sampleKg, setSampleKg] = useState("");

  // Picking a grade fills in that grade's configured sample weight. kg/bag is
  // never auto-filled — the grade's default_kg_per_bag is only a minimum the
  // entered kg/bag is validated against on save.
  function pickGrade(code: string) {
    const match = grades.find((option) => option.code === code);
    if (match?.sampleWeight != null) setSampleKg(String(match.sampleWeight));
  }

  const gross = (Number(bags) || 0) * (Number(kgPerBag) || 0);
  const net = Math.max(0, gross - (Number(sampleKg) || 0));

  return (
    <>
      {!hideDispatchDate && (
        <td className="px-4 py-3">
          <input
            form={formId}
            name="dispatch_date"
            type="date"
            required
            defaultValue={defaults.dispatchDate ?? ""}
            aria-label="Dispatch date"
            className={dateInput}
          />
        </td>
      )}
      <td className="px-4 py-3">
        {hideDispatchDate && (
          <input form={formId} type="hidden" name="dispatch_date" defaultValue={defaults.dispatchDate ?? ""} />
        )}
        {bundledDispatchId && (
          <input form={formId} type="hidden" name="bundled_dispatch_id" defaultValue={bundledDispatchId} />
        )}
        <input
          form={formId}
          name="sale_date"
          type="date"
          required
          defaultValue={defaults.saleDate ?? ""}
          aria-label="Sale date"
          className={dateInput}
        />
      </td>
      <td className="px-4 py-3">
        <LovCombobox
          source="auction.brokers"
          name="broker_id"
          formId={formId}
          placeholder="Broker (optional)…"
          ariaLabel="Broker"
          className={cellInput}
        />
      </td>
      <td className="px-4 py-3">
        <input
          form={formId}
          name="invoice_no"
          required
          placeholder="e.g. 0021"
          aria-label="Invoice number"
          onBlur={(event) => { event.currentTarget.value = formatFourDigitNo(event.currentTarget.value); }}
          className={cellInput}
        />
      </td>
      <td className="px-4 py-3">
        <input
          form={formId}
          name="bags"
          type="number"
          min="1"
          required
          aria-label="Bags"
          value={bags}
          onChange={(event) => setBags(event.target.value)}
          className={`${cellInput} text-right`}
        />
      </td>
      <td className="px-4 py-3">
        <LovCombobox
          source="auction.grades"
          name="grade"
          formId={formId}
          required
          placeholder="Grade…"
          ariaLabel="Grade"
          onSelect={(option) => pickGrade(option?.value ?? "")}
          className={cellInput}
        />
      </td>
      <td className="px-4 py-3">
        <input
          form={formId}
          name="kg_per_bag"
          type="number"
          step="0.01"
          min="0"
          required
          aria-label="Weight per bag"
          value={kgPerBag}
          onChange={(event) => setKgPerBag(event.target.value)}
          className={`${cellInput} text-right`}
        />
      </td>
      <td className="px-4 py-3">
        <input
          form={formId}
          name="sample_allowance"
          type="number"
          step="0.01"
          min="0"
          aria-label="Sample weight"
          value={sampleKg}
          onChange={(event) => setSampleKg(event.target.value)}
          className={`${cellInput} text-right`}
        />
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-medium">{net.toFixed(2)}</td>
      <td className="px-4 py-3">
        <LovCombobox
          source="auction.marks"
          name="selling_mark_id"
          formId={formId}
          required
          placeholder="Mark…"
          ariaLabel="Mark"
          className={cellInput}
        />
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{gross.toFixed(2)}</td>
      <td className="px-4 py-3">
        <input
          form={formId}
          name="target_sale_no"
          required
          defaultValue={defaults.saleNo ?? ""}
          placeholder="e.g. 0019"
          aria-label="Sale number"
          onBlur={(event) => { event.currentTarget.value = formatSaleNo(event.currentTarget.value); }}
          className={cellInput}
        />
      </td>
      {/* Next sale no. and Check are both derived once the lot has a state. */}
      <td className={`px-4 py-3 ${muted}`}>—</td>
      <td className={`px-4 py-3 ${muted}`}>—</td>
      <td className="px-4 py-3">
        <input form={formId} name="lot_no" aria-label="Lot number" className={cellInput} />
      </td>
      {/* Dispatch invoice, lot state and BI state are all server-assigned. */}
      <td className={`px-4 py-3 ${muted}`}>Auto</td>
      <td className={`px-4 py-3 ${muted}`}>New</td>
      <td className={`px-4 py-3 ${muted}`}>Draft</td>
    </>
  );
}
