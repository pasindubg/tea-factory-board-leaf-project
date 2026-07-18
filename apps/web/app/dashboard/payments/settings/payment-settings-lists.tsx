"use client";

import { useState, type FormEvent } from "react";
import { EntityList, EntityListTabs, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { showAppToast } from "@/components/action-feedback";
import { SubmitButton } from "@/components/submit-button";
import { lkr } from "@/lib/money";
import type { BaseRateListRow, QualityTierListRow } from "@/lib/list-resources";
import { saveBaseRate, saveSettings, saveTier, setTierActive } from "../actions";

export type PaymentSettingsValues = {
  transportPerKg: string;
  waterPenaltyMode: "per_kg" | "percent";
  waterPenaltyPerKg: string;
  defaultWaterPenaltyPct: string;
};

const input = "mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-green-600 focus:outline-none disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:focus:border-green-500 dark:disabled:bg-stone-800";
const compactInput = "w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-green-600 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:focus:border-green-500";
const today = () => new Date().toISOString().slice(0, 10);

const RATE_COLUMNS: EntityListColumn<BaseRateListRow>[] = [
  { key: "pricePerKg", label: "Rate (LKR/kg)", accessor: (row) => Number(row.pricePerKg), sortable: true, searchInput: "number", lov: false, cellClassName: "text-right font-medium tabular-nums", render: (row) => lkr(row.pricePerKg) },
  { key: "effectiveFrom", label: "Effective from", accessor: (row) => row.effectiveFrom, sortable: true, searchInput: "date" },
  { key: "effectiveTo", label: "Effective to", accessor: (row) => row.effectiveTo ?? "Current", sortable: true, searchInput: "date", render: (row) => row.effectiveTo ?? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-300">Current</span> },
];

const RATE_LIST = {
  columns: RATE_COLUMNS,
  selectionMode: "single",
  add: true,
  edit: false,
  delete: false,
} satisfies ListDefinition<BaseRateListRow>;

const TIER_COLUMNS: EntityListColumn<QualityTierListRow>[] = [
  {
    key: "name",
    label: "Name",
    accessor: (row) => row.name,
    sortable: true,
    filter: "text",
    lov: false,
    cellClassName: "font-medium",
    edit: (row, { formId }) => <input form={formId} name="name" aria-label="Tier name" defaultValue={row.name} required className={compactInput} />,
  },
  {
    key: "bonusKind",
    label: "Bonus type",
    accessor: (row) => row.bonusKind,
    sortable: true,
    filter: "select",
    render: (row) => row.bonusKind === "percent" ? "% of base" : "Flat LKR/kg",
    edit: (row, { formId }) => (
      <select form={formId} name="bonus_kind" aria-label="Bonus type" defaultValue={row.bonusKind} className={compactInput}>
        <option value="flat">Flat LKR/kg</option>
        <option value="percent">% of base</option>
      </select>
    ),
  },
  {
    key: "bonusValue",
    label: "Value",
    accessor: (row) => Number(row.bonusValue),
    sortable: true,
    searchInput: "number",
    lov: false,
    headerClassName: "text-right",
    cellClassName: "text-right tabular-nums",
    render: (row) => Number(row.bonusValue).toFixed(2),
    edit: (row, { formId }) => <input form={formId} name="bonus_value" aria-label="Bonus value" type="number" step="0.01" min="0" defaultValue={row.bonusValue} required className={`${compactInput} text-right`} />,
  },
  {
    key: "sortOrder",
    label: "Rank",
    accessor: (row) => row.sortOrder,
    sortable: true,
    searchInput: "number",
    lov: false,
    headerClassName: "text-right",
    cellClassName: "text-right tabular-nums",
    edit: (row, { formId }) => <input form={formId} name="sort_order" aria-label="Tier rank" type="number" step="1" defaultValue={row.sortOrder} className={`${compactInput} text-right`} />,
  },
  {
    key: "active",
    label: "Status",
    accessor: (row) => row.active ? "active" : "inactive",
    sortable: true,
    filter: "select",
    filterOptions: [
      { value: "active", label: "active" },
      { value: "inactive", label: "inactive" },
    ],
    render: (row) => (
      <span className={`rounded-full px-2 py-0.5 text-xs ${row.active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"}`}>
        {row.active ? "active" : "inactive"}
      </span>
    ),
  },
];

const TIER_LIST = {
  columns: TIER_COLUMNS,
  selectionMode: "single",
  add: true,
  edit: true,
  delete: false,
  commands: [
    { id: "deactivate", label: "Deactivate", requiresSelection: true },
    { id: "activate", label: "Activate", requiresSelection: true },
  ],
} satisfies ListDefinition<QualityTierListRow>;

export function PaymentSettingsLists({
  rates,
  tiers,
  settings,
  canManage,
  isOwner,
}: {
  rates: BaseRateListRow[];
  tiers: QualityTierListRow[];
  settings: PaymentSettingsValues;
  canManage: boolean;
  isOwner: boolean;
}) {
  return (
    <EntityListTabs
      defaultTab="rates"
      tabs={[
        { id: "rates", label: "Base rates", content: <BaseRatesList initialRows={rates} canManage={canManage} /> },
        { id: "tiers", label: "Quality tiers", content: <QualityTiersList initialRows={tiers} isOwner={isOwner} /> },
        { id: "deductions", label: "Deductions", content: <DeductionsSettings initialSettings={settings} canManage={canManage} /> },
      ]}
    />
  );
}

function BaseRatesList({ initialRows, canManage }: { initialRows: BaseRateListRow[]; canManage: boolean }) {
  return (
    <EntityList
      resource={{ key: "payments.base-rates" }}
      initialRows={initialRows}
      definition={RATE_LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `base rate effective ${row.effectiveFrom}`}
      title="Base green-leaf rate"
      description="Effective-dated per-kg rates. Adding a rate closes the current period automatically without changing history."
      canCreate={canManage}
      emptyMessage="No base rate history yet."
      beforeTable={(resourceRows) => <CurrentRateSummary resourceRows={resourceRows} />}
      create={{
        action: saveBaseRate,
        label: "New rate",
        panelTitle: "Set a new base rate",
        disabledReason: canManage ? "Finish adding the current rate first." : "Only owners and managers can set base rates.",
        render: ({ action, close }) => (
          <form action={action} className="flex flex-wrap items-end gap-3">
            <label className="text-sm">New rate (LKR/kg)<input name="price_per_kg" type="number" step="0.01" min="0.01" required className={`${input} w-40`} /></label>
            <label className="text-sm">Effective from<input name="effective_from" type="date" defaultValue={today()} required className={`${input} w-44`} /></label>
            <SubmitButton pendingText="Saving…" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700">Set rate</SubmitButton>
            <button type="button" onClick={close} className="rounded-md border border-stone-300 px-4 py-2 text-sm dark:border-stone-600">Cancel</button>
          </form>
        ),
      }}
    />
  );
}

function CurrentRateSummary({ resourceRows }: { resourceRows: BaseRateListRow[] }) {
  const currentRate = resourceRows.find((rate) => rate.effectiveTo === null);
  return <div className="border-b border-stone-100 px-4 py-3 text-sm dark:border-stone-800">Current: <span className="font-semibold">{currentRate ? `${lkr(currentRate.pricePerKg)}/kg from ${currentRate.effectiveFrom}` : "not set"}</span></div>;
}

function QualityTiersList({ initialRows, isOwner }: { initialRows: QualityTierListRow[]; isOwner: boolean }) {
  return (
    <EntityList
      resource={{ key: "payments.quality-tiers" }}
      initialRows={initialRows}
      definition={TIER_LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.name}
      title="Quality tiers (superleaf)"
      description="Bonuses applied above the base rate. The factory owner controls this financial catalog."
      canCreate={isOwner}
      emptyMessage="No quality tiers yet."
      create={{
        action: saveTier,
        label: "New tier",
        panelTitle: "Add a quality tier",
        disabledReason: isOwner ? "Finish the current tier change first." : "Only the factory owner can add quality tiers.",
        render: ({ action, close, rows }) => (
          <form action={action} className="flex flex-wrap items-end gap-3">
            <TierFields defaultSortOrder={(rows.at(-1)?.sortOrder ?? 0) + 10} />
            <SubmitButton pendingText="Adding…" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700">Add tier</SubmitButton>
            <button type="button" onClick={close} className="rounded-md border border-stone-300 px-4 py-2 text-sm dark:border-stone-600">Cancel</button>
          </form>
        ),
      }}
      edit={{
        canEdit: isOwner,
        action: (row, formData) => {
          formData.set("id", row.id);
          return saveTier(formData);
        },
        saveLabel: "Save changes",
      }}
      commands={[
        {
          id: "deactivate",
          label: "Deactivate",
          visible: isOwner,
          disabled: ({ selectedRows }) => selectedRows.length !== 1 || !selectedRows[0].active,
          run: ({ selectedRows }) => tierStatusAction(selectedRows[0].id, false),
        },
        {
          id: "activate",
          label: "Activate",
          visible: isOwner,
          disabled: ({ selectedRows }) => selectedRows.length !== 1 || selectedRows[0].active,
          run: ({ selectedRows }) => tierStatusAction(selectedRows[0].id, true),
        },
      ]}
    />
  );
}

function tierStatusAction(id: string, active: boolean) {
  const formData = new FormData();
  formData.set("selected_ids", id);
  formData.set("active", String(active));
  return setTierActive(formData);
}

function TierFields({ defaultSortOrder }: { defaultSortOrder: number }) {
  return (
    <>
      <label className="text-sm">
        Name
        <input name="name" placeholder="Superleaf" required className={`${input} w-40`} />
      </label>
      <label className="text-sm">
        Bonus type
        <select name="bonus_kind" defaultValue="flat" className={`${input} w-40`}>
          <option value="flat">Flat LKR/kg</option>
          <option value="percent">% of base</option>
        </select>
      </label>
      <label className="text-sm">
        Value
        <input name="bonus_value" type="number" step="0.01" min="0" defaultValue="0" required className={`${input} w-28`} />
      </label>
      <label className="text-sm">
        Rank
        <input name="sort_order" type="number" step="1" defaultValue={defaultSortOrder} className={`${input} w-24`} />
      </label>
    </>
  );
}

function DeductionsSettings({ initialSettings, canManage }: { initialSettings: PaymentSettingsValues; canManage: boolean }) {
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await saveSettings(new FormData(event.currentTarget));
      if (!result.ok) {
        showAppToast(result.error, "error");
        return;
      }
      showAppToast(result.notice ?? "Deduction defaults saved.");
    } catch {
      showAppToast("Deduction defaults could not be saved. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[1.25rem] border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900" aria-labelledby="deduction-settings-title">
      <h2 id="deduction-settings-title" className="text-base font-semibold text-stone-900 dark:text-stone-100">Deduction defaults</h2>
      <p className="mt-1 max-w-4xl text-sm text-stone-500 dark:text-stone-400">
        Transport applies to supplier kilograms automatically. The selected water-penalty mode is charged only on deliveries marked as wet at intake.
      </p>
      <form onSubmit={submit} className="mt-5 flex flex-wrap items-end gap-3" data-action-feedback-ignore>
        <label className="text-sm">
          Transport (LKR/kg)
          <input name="transport_per_kg" type="number" step="0.01" min="0" defaultValue={initialSettings.transportPerKg} disabled={!canManage || saving} className={`${input} w-40`} />
        </label>
        <label className="text-sm">
          Water penalty mode
          <select name="water_penalty_mode" defaultValue={initialSettings.waterPenaltyMode} disabled={!canManage || saving} className={`${input} w-48`}>
            <option value="percent">% of delivery value</option>
            <option value="per_kg">Flat LKR/kg</option>
          </select>
        </label>
        <label className="text-sm">
          Penalty rate (%)
          <input name="default_water_penalty_pct" type="number" step="0.01" min="0" max="100" defaultValue={initialSettings.defaultWaterPenaltyPct} disabled={!canManage || saving} className={`${input} w-36`} />
        </label>
        <label className="text-sm">
          Penalty rate (LKR/kg)
          <input name="water_penalty_per_kg" type="number" step="0.01" min="0" defaultValue={initialSettings.waterPenaltyPerKg} disabled={!canManage || saving} className={`${input} w-40`} />
        </label>
        {canManage && (
          <button type="submit" disabled={saving} className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-green-600 dark:hover:bg-green-700">
            {saving ? "Saving…" : "Save defaults"}
          </button>
        )}
      </form>
      <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
        Fill the field matching the selected mode; the other rate is retained but ignored. {canManage ? "" : "Only owners and managers can change these values."}
      </p>
    </section>
  );
}
