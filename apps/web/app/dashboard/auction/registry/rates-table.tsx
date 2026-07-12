"use client";

import { useState } from "react";
import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";
import { deleteBrokerRate, updateBrokerRate } from "../actions";
import { ConfirmSubmitButton } from "@/components/confirmation-dialog";

export type RateRow = {
  id: string;
  brokerId: string;
  broker: string;
  effectiveFrom: string;
  brokeragePct: number;
  insurancePerKg: number;
  handlingPerKg: number;
  eplatformPerKg: number;
  publicSaleExPerLot: number;
  documentationPerLot: number;
  govtReliefLoan: number;
  chargesVatPct: number;
  proceedsVatPct: number;
};

type BrokerOption = { id: string; name: string };

const COLUMNS: ColumnDef<RateRow>[] = [
  { key: "broker", label: "Broker", accessor: (r) => r.broker, sortable: true, filter: "select" },
  { key: "effectiveFrom", label: "Effective", accessor: (r) => r.effectiveFrom, sortable: true, searchInput: "date" },
  { key: "brokeragePct", label: "Brokerage", accessor: (r) => r.brokeragePct, sortable: true, searchInput: "number" },
  { key: "insurancePerKg", label: "Ins./kg", accessor: (r) => r.insurancePerKg, sortable: true },
  { key: "chargesVatPct", label: "Charges VAT", accessor: (r) => r.chargesVatPct, sortable: true },
];

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";
const fieldClass = "grid gap-1 text-[11px] font-medium text-stone-500 dark:text-stone-400";

export function RatesTable({ rows, brokers, isOwner }: { rows: RateRow[]; brokers: BrokerOption[]; isOwner: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-3 py-3 ${col.key === "broker" || col.key === "effectiveFrom" ? "" : "text-right"}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
            {isOwner && <th className="px-3 py-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => {
            const isEditing = editingId === r.id;
            const formId = `rate-${r.id}`;
            return (
              <tr key={r.id} className="border-b border-stone-100 align-top last:border-0 dark:border-stone-800">
                {isEditing ? (
                  <td colSpan={isOwner ? 6 : 5} className="px-3 py-3">
                    <form id={formId} action={updateBrokerRate.bind(null, r.id)} className="grid gap-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className={fieldClass}>
                          Broker
                          <select name="broker_id" defaultValue={r.brokerId} className={input}>
                            {brokers.map((broker) => (
                              <option key={broker.id} value={broker.id}>{broker.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className={fieldClass}>
                          Effective from
                          <input type="date" name="effective_from" required defaultValue={r.effectiveFrom} className={input} />
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <RateInput name="brokerage_pct" label="Brokerage %" value={r.brokeragePct} />
                        <RateInput name="insurance_per_kg" label="Insurance /kg" value={r.insurancePerKg} decimals={4} />
                        <RateInput name="handling_per_kg" label="Handling /kg" value={r.handlingPerKg} decimals={4} />
                        <RateInput name="eplatform_per_kg" label="e-Platform /kg" value={r.eplatformPerKg} decimals={4} />
                        <RateInput name="public_sale_ex_per_lot" label="Public sale ex. /lot" value={r.publicSaleExPerLot} />
                        <RateInput name="documentation_per_lot" label="Documentation /lot" value={r.documentationPerLot} />
                        <RateInput name="govt_relief_loan" label="Govt relief loan" value={r.govtReliefLoan} />
                        <RateInput name="charges_vat_pct" label="Charges VAT %" value={r.chargesVatPct} />
                        <RateInput name="proceeds_vat_pct" label="Proceeds VAT %" value={r.proceedsVatPct} />
                      </div>
                    </form>
                    <div className="mt-3 flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-md border border-stone-300 px-2 py-1 text-xs dark:border-stone-600">
                        Cancel
                      </button>
                      <button form={formId} className="rounded-md bg-green-700 px-2 py-1 text-xs font-medium text-white dark:bg-green-600">
                        Save
                      </button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-3 font-medium">{r.broker}</td>
                    <td className="px-3 py-3">{r.effectiveFrom}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.brokeragePct.toFixed(3)}%</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.insurancePerKg.toFixed(4)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.chargesVatPct.toFixed(0)}%</td>
                    {isOwner && (
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setEditingId(r.id)} className="rounded-md border border-stone-300 px-2 py-1 text-xs dark:border-stone-600">
                            Edit
                          </button>
                          <form action={deleteBrokerRate.bind(null, r.id)}>
                            <ConfirmSubmitButton title="Delete rate card?" description="This rate card will be permanently removed. This cannot be undone." className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950">
                              Delete
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      </td>
                    )}
                  </>
                )}
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={isOwner ? 6 : 5} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No rate cards match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={isOwner ? 6 : 5} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No rate cards yet — add one so settlements can be computed.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function RateInput({ name, label, value, decimals = 2 }: { name: string; label: string; value: number; decimals?: number }) {
  return (
    <label className={fieldClass}>
      {label}
      <input name={name} type="number" step="any" min="0" defaultValue={value.toFixed(decimals)} className={input} />
    </label>
  );
}
