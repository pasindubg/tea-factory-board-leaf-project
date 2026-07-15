"use client";

import { useState } from "react";
import { ListCommandToolbar, ListCreatePanel, ListSearchPanel, ListSurface, SortButton, useFrameworkListData, useListControls, useListSelection, type ColumnDef, type ListDefinition } from "@/components/list-controls";
import { createBrokerRate, deleteBrokerRate, updateBrokerRate } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

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
const LIST: ListDefinition<RateRow> = { columns: COLUMNS, selectionMode: "single", add: true, edit: true, delete: true };

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";
const fieldClass = "grid gap-1 text-[11px] font-medium text-stone-500 dark:text-stone-400";

export function RatesTable({ rows: initialRows, brokers, isOwner }: { rows: RateRow[]; brokers: BrokerOption[]; isOwner: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { rows, refreshing, mutate, mutationAction } = useFrameworkListData({ initialRows, resource: { key: "auction.broker-rates" } });
  const controls = useListControls(rows, LIST.columns);
  const selection = useListSelection(rows, { mode: LIST.selectionMode ?? "single", getId: (row) => row.id });
  const visibleRows = controls.rows;

  return (
    <ListSurface
      title="Broker rate cards"
      onCreate={() => setAdding(true)}
      canCreate={isOwner && !editingId && !adding}
      createDisabledReason={isOwner ? "Finish editing the current rate card first." : "Only the owner can add rate cards."}
      createLabel="New rate card"
      refreshing={refreshing}
    >
      <ListCommandToolbar
        mode={LIST.selectionMode ?? "single"}
        count={selection.selectedCount}
        enableEdit={isOwner && Boolean(LIST.edit)}
        onEdit={{ onClick: () => setEditingId(selection.selectedId), disabled: !selection.selectedId || Boolean(editingId) || adding }}
        enableDelete={isOwner && Boolean(LIST.delete)}
        onDelete={{ onClick: () => setConfirmingDelete(true), disabled: !selection.selectedId || Boolean(editingId) || adding || deleting }}
      >
        {editingId && <><button type="button" onClick={() => setEditingId(null)} className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold dark:border-stone-600">Cancel</button><button form={`rate-${editingId}`} className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">Save</button></>}
      </ListCommandToolbar>
      <ListCreatePanel open={adding} title="Add broker rate card"><form action={mutationAction(createBrokerRate, { onSuccess: () => setAdding(false) })} className="grid gap-3"><div className="grid gap-3 sm:grid-cols-2"><select name="broker_id" required defaultValue="" className={input}><option value="" disabled>Pick a broker…</option>{brokers.map((broker) => <option key={broker.id} value={broker.id}>{broker.name}</option>)}</select><input type="date" name="effective_from" required defaultValue={new Date().toISOString().slice(0, 10)} className={input} /></div><div className="grid gap-3 sm:grid-cols-3">{RATE_INPUTS.map((field) => <input key={field.name} name={field.name} type="number" step="any" min="0" defaultValue={field.defaultValue} placeholder={field.label} className={input} />)}</div><div><SubmitButton pendingText="Adding…" className="rounded-full bg-green-700 px-4 text-sm font-semibold text-white">Add rate card</SubmitButton></div></form></ListCreatePanel>
      <ListSearchPanel columns={LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-3 py-3 ${col.key === "broker" || col.key === "effectiveFrom" ? "" : "text-right"}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => {
            const isEditing = editingId === r.id;
            const formId = `rate-${r.id}`;
            return (
              <tr key={r.id} {...selection.rowProps(r.id, isEditing)} className={`cursor-pointer border-b border-stone-100 align-top last:border-0 dark:border-stone-800 ${selection.isSelected(r.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}>
                {isEditing ? (
                  <td colSpan={5} className="px-3 py-3">
                    <form id={formId} action={mutationAction(updateBrokerRate.bind(null, r.id), { onSuccess: () => setEditingId(null) })} className="grid gap-3">
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
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-3 font-medium">{r.broker}</td>
                    <td className="px-3 py-3">{r.effectiveFrom}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.brokeragePct.toFixed(3)}%</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.insurancePerKg.toFixed(4)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.chargesVatPct.toFixed(0)}%</td>
                  </>
                )}
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No rate cards match these filters.</td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No rate cards yet — add one so settlements can be computed.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      <ConfirmationDialog
        open={confirmingDelete}
        title="Delete rate card?"
        description="This rate card will be permanently removed. If another record uses it, deletion will be blocked with the dependent record type."
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          if (!selection.selectedId) return;
          setDeleting(true);
          const deleted = await mutate(() => deleteBrokerRate(selection.selectedId!), { onSuccess: selection.clear });
          setDeleting(false);
          if (deleted) setConfirmingDelete(false);
        }}
      />
    </ListSurface>
  );
}

const RATE_INPUTS = [
  { name: "brokerage_pct", label: "Brokerage %", defaultValue: "1" }, { name: "insurance_per_kg", label: "Insurance /kg", defaultValue: "0" }, { name: "handling_per_kg", label: "Handling /kg", defaultValue: "0" }, { name: "eplatform_per_kg", label: "e-Platform /kg", defaultValue: "0" }, { name: "public_sale_ex_per_lot", label: "Public sale ex. /lot", defaultValue: "0" }, { name: "documentation_per_lot", label: "Documentation /lot", defaultValue: "0" }, { name: "govt_relief_loan", label: "Govt relief loan", defaultValue: "0" }, { name: "charges_vat_pct", label: "Charges VAT %", defaultValue: "18" }, { name: "proceeds_vat_pct", label: "Proceeds VAT %", defaultValue: "18" },
];

function RateInput({ name, label, value, decimals = 2 }: { name: string; label: string; value: number; decimals?: number }) {
  return (
    <label className={fieldClass}>
      {label}
      <input name={name} type="number" step="any" min="0" defaultValue={value.toFixed(decimals)} className={input} />
    </label>
  );
}
