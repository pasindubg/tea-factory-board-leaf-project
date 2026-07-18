"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { createBrokerRate, deleteBrokerRate, updateBrokerRate } from "../actions";

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

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";
const fieldClass = "grid gap-1 text-[11px] font-medium text-stone-500 dark:text-stone-400";

const COLUMNS: EntityListColumn<RateRow>[] = [
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select", cellClassName: "font-medium" },
  { key: "effectiveFrom", label: "Effective", accessor: (row) => row.effectiveFrom, sortable: true, searchInput: "date" },
  { key: "brokeragePct", label: "Brokerage", accessor: (row) => row.brokeragePct, sortable: true, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => `${row.brokeragePct.toFixed(3)}%` },
  { key: "insurancePerKg", label: "Ins./kg", accessor: (row) => row.insurancePerKg, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.insurancePerKg.toFixed(4) },
  { key: "chargesVatPct", label: "Charges VAT", accessor: (row) => row.chargesVatPct, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => `${row.chargesVatPct.toFixed(0)}%` },
];

const LIST: ListDefinition<RateRow> = {
  columns: COLUMNS,
  selectionMode: "single",
  add: true,
  edit: true,
  delete: true,
};

export function RatesTable({ rows, brokers, isOwner }: { rows: RateRow[]; brokers: BrokerOption[]; isOwner: boolean }) {
  return (
    <EntityList
      resource={{ key: "auction.broker-rates" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `${row.broker} rate card`}
      title="Broker rate cards"
      emptyMessage="No rate cards yet — add one so settlements can be computed."
      canCreate={isOwner}
      create={{
        action: createBrokerRate,
        label: "New rate card",
        panelTitle: "Add broker rate card",
        disabledReason: isOwner ? "Finish the current rate card change first." : "Only the owner can add rate cards.",
        render: ({ action }) => <RateForm action={action} brokers={brokers} />,
      }}
      edit={{
        canEdit: isOwner,
        label: "Edit",
        action: (row, formData) => updateBrokerRate(row.id, formData),
        renderPanel: ({ row, action, close }) => (
          <RateForm action={action} brokers={brokers} row={row} onCancel={close} />
        ),
      }}
      canDelete={isOwner}
      deleteAction={{
        action: async (ids) => deleteBrokerRate(ids[0]),
        title: () => "Delete rate card?",
        description: () => "This rate card will be permanently removed. If another record uses it, deletion will be blocked with the dependent record type.",
      }}
    />
  );
}

function RateForm({
  action,
  brokers,
  row,
  onCancel,
}: {
  action: (formData: FormData) => Promise<void>;
  brokers: BrokerOption[];
  row?: RateRow;
  onCancel?: () => void;
}) {
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={fieldClass}>
          Broker
          <select name="broker_id" required defaultValue={row?.brokerId ?? ""} className={input}>
            {!row && <option value="" disabled>Pick a broker…</option>}
            {brokers.map((broker) => <option key={broker.id} value={broker.id}>{broker.name}</option>)}
          </select>
        </label>
        <label className={fieldClass}>
          Effective from
          <input type="date" name="effective_from" required defaultValue={row?.effectiveFrom ?? new Date().toISOString().slice(0, 10)} className={input} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {row ? (
          <>
            <RateInput name="brokerage_pct" label="Brokerage %" value={row.brokeragePct} />
            <RateInput name="insurance_per_kg" label="Insurance /kg" value={row.insurancePerKg} decimals={4} />
            <RateInput name="handling_per_kg" label="Handling /kg" value={row.handlingPerKg} decimals={4} />
            <RateInput name="eplatform_per_kg" label="e-Platform /kg" value={row.eplatformPerKg} decimals={4} />
            <RateInput name="public_sale_ex_per_lot" label="Public sale ex. /lot" value={row.publicSaleExPerLot} />
            <RateInput name="documentation_per_lot" label="Documentation /lot" value={row.documentationPerLot} />
            <RateInput name="govt_relief_loan" label="Govt relief loan" value={row.govtReliefLoan} />
            <RateInput name="charges_vat_pct" label="Charges VAT %" value={row.chargesVatPct} />
            <RateInput name="proceeds_vat_pct" label="Proceeds VAT %" value={row.proceedsVatPct} />
          </>
        ) : RATE_INPUTS.map((field) => (
          <label key={field.name} className={fieldClass}>
            {field.label}
            <input name={field.name} type="number" step="any" min="0" defaultValue={field.defaultValue} className={input} />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-full border border-stone-300 px-4 text-sm font-semibold dark:border-stone-600">Cancel</button>}
        <SubmitButton pendingText="Saving…" className="rounded-full bg-green-700 px-4 text-sm font-semibold text-white">
          {row ? "Save rate card" : "Add rate card"}
        </SubmitButton>
      </div>
    </form>
  );
}

const RATE_INPUTS = [
  { name: "brokerage_pct", label: "Brokerage %", defaultValue: "1" },
  { name: "insurance_per_kg", label: "Insurance /kg", defaultValue: "0" },
  { name: "handling_per_kg", label: "Handling /kg", defaultValue: "0" },
  { name: "eplatform_per_kg", label: "e-Platform /kg", defaultValue: "0" },
  { name: "public_sale_ex_per_lot", label: "Public sale ex. /lot", defaultValue: "0" },
  { name: "documentation_per_lot", label: "Documentation /lot", defaultValue: "0" },
  { name: "govt_relief_loan", label: "Govt relief loan", defaultValue: "0" },
  { name: "charges_vat_pct", label: "Charges VAT %", defaultValue: "18" },
  { name: "proceeds_vat_pct", label: "Proceeds VAT %", defaultValue: "18" },
];

function RateInput({ name, label, value, decimals = 2 }: { name: string; label: string; value: number; decimals?: number }) {
  return (
    <label className={fieldClass}>
      {label}
      <input name={name} type="number" step="any" min="0" defaultValue={value.toFixed(decimals)} className={input} />
    </label>
  );
}
