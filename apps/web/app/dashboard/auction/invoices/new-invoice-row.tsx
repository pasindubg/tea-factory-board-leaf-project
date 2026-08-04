"use client";

import { useState } from "react";
import { formatFourDigitNo } from "../sale-number";

export type BrokerOption = { id: string; name: string };
export type MarkOption = { id: string; code: string; name: string | null };
export type GradeOption = { code: string; name: string; sampleWeight: number | null; defaultKgPerBag: number | null };

/** Pre-filled from the most recent broker invoice; every one stays editable. */
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
 * Broker, mark and dispatch date decide which broker invoice the row joins;
 * sale no. and sale date are only used when no broker invoice is open for that
 * combination yet and one has to be created.
 */
export function NewInvoiceRow({
  formId,
  brokers,
  marks,
  grades,
  defaults,
}: {
  formId: string;
  brokers: BrokerOption[];
  marks: MarkOption[];
  grades: GradeOption[];
  defaults: NewInvoiceDefaults;
}) {
  const [bags, setBags] = useState("10");
  const [kgPerBag, setKgPerBag] = useState("");
  const [sampleKg, setSampleKg] = useState("");

  // Picking a grade fills in that grade's configured kg/bag and sample weight,
  // matching the lot entry row on the broker invoice detail page.
  function pickGrade(code: string) {
    const match = grades.find((option) => option.code === code);
    if (match?.defaultKgPerBag != null) setKgPerBag(String(match.defaultKgPerBag));
    if (match?.sampleWeight != null) setSampleKg(String(match.sampleWeight));
  }

  const gross = (Number(bags) || 0) * (Number(kgPerBag) || 0);
  const net = Math.max(0, gross - (Number(sampleKg) || 0));

  return (
    <>
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
      <td className="px-4 py-3">
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
        <select form={formId} name="broker_id" required defaultValue="" aria-label="Broker" className={cellInput}>
          <option value="" disabled>Broker…</option>
          {brokers.map((broker) => (
            <option key={broker.id} value={broker.id}>{broker.name}</option>
          ))}
        </select>
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
        <select
          form={formId}
          name="grade"
          required
          defaultValue=""
          aria-label="Grade"
          onChange={(event) => pickGrade(event.target.value)}
          className={cellInput}
        >
          <option value="" disabled>Grade…</option>
          {grades.map((option) => (
            <option key={option.code} value={option.code}>{option.code}</option>
          ))}
        </select>
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
        <select form={formId} name="selling_mark_id" required defaultValue="" aria-label="Mark" className={cellInput}>
          <option value="" disabled>Mark…</option>
          {marks.map((mark) => (
            <option key={mark.id} value={mark.id}>{mark.code}{mark.name ? ` — ${mark.name}` : ""}</option>
          ))}
        </select>
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
          className={cellInput}
        />
      </td>
      {/* Next sale no. and Check are both derived once the lot has a state. */}
      <td className={`px-4 py-3 ${muted}`}>—</td>
      <td className={`px-4 py-3 ${muted}`}>—</td>
      <td className="px-4 py-3">
        <input form={formId} name="lot_no" aria-label="Lot number" className={cellInput} />
      </td>
      {/* Broker invoice, lot state and BI state are all server-assigned. */}
      <td className={`px-4 py-3 ${muted}`}>Auto</td>
      <td className={`px-4 py-3 ${muted}`}>New</td>
      <td className={`px-4 py-3 ${muted}`}>Draft</td>
    </>
  );
}
