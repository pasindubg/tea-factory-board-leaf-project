"use client";

import { LovCombobox } from "@/components/lov-combobox";
import type { CollectorOption } from "./suppliers-table";

const cellInput = "w-full min-w-24 rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900";

/**
 * The draft row rendered inside the list when "New customer" is pressed. Its
 * cells follow the table's column order so the entry lines up under its own
 * headers. Photo and bank book are captured by the field app, not typed here.
 */
export function NewCustomerRow({ formId, collectors }: { formId: string; collectors: CollectorOption[] }) {
  return (
    <>
      <td className="px-4 py-3">
        <input form={formId} name="customer_no" required inputMode="numeric" pattern="[0-9]+" aria-label="Customer number" className={cellInput} />
      </td>
      <td className="px-4 py-3">
        <input form={formId} name="name" required aria-label="Customer name" className={cellInput} />
      </td>
      <td className="px-4 py-3">
        <input form={formId} name="area" aria-label="Area" className={cellInput} />
      </td>
      <td className="px-4 py-3">
        <LovCombobox source="leaf.lines" name="line_id" formId={formId} ariaLabel="Line" />
      </td>
      <td className="px-4 py-3">
        <input form={formId} name="address" aria-label="Address" className={cellInput} />
      </td>
      <td className="px-4 py-3">
        <input form={formId} name="phone" required aria-label="Mobile number" className={cellInput} />
      </td>
      <td className="px-4 py-3">
        <input form={formId} name="nic_number" aria-label="NIC number" className={cellInput} />
      </td>
      <td className="px-4 py-3">
        <select form={formId} name="collector_id" aria-label="Collector" defaultValue="" className={cellInput}>
          <option value="">— none —</option>
          {collectors.filter((collector) => collector.active).map((collector) => (
            <option key={collector.id} value={collector.id}>{collector.name}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <input form={formId} name="land_size_acres" type="number" step="0.01" min="0" aria-label="Land size in acres" className={`${cellInput} text-right`} />
      </td>
      <td className="px-4 py-3">
        <input form={formId} name="cultivated_area_acres" type="number" step="0.01" min="0" aria-label="Cultivated area in acres" className={`${cellInput} text-right`} />
      </td>
      <td className="px-4 py-3">
        <input form={formId} name="latitude" required type="number" step="0.0000001" min="-90" max="90" aria-label="Latitude" className={`${cellInput} text-right`} />
      </td>
      <td className="px-4 py-3">
        <input form={formId} name="longitude" required type="number" step="0.0000001" min="-180" max="180" aria-label="Longitude" className={`${cellInput} text-right`} />
      </td>
      <td className="px-4 py-3 text-xs text-stone-400 dark:text-stone-500">field app</td>
      <td className="px-4 py-3 text-xs text-stone-400 dark:text-stone-500">field app</td>
      <td className="px-4 py-3">
        <input form={formId} name="bank_account_no" aria-label="Bank account number" className={cellInput} />
      </td>
      <td className="px-4 py-3" />
    </>
  );
}
