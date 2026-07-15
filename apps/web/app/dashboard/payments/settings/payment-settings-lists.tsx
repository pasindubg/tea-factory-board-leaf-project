"use client";

import { useState, type FormEvent } from "react";
import {
  ListCommandToolbar,
  ListCreatePanel,
  ListSearchPanel,
  ListSurface,
  SortButton,
  TabbedListSurface,
  useFrameworkListData,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";
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

const RATE_COLUMNS: ColumnDef<BaseRateListRow>[] = [
  { key: "pricePerKg", label: "Rate (LKR/kg)", accessor: (row) => Number(row.pricePerKg), sortable: true, searchInput: "number", lov: false },
  { key: "effectiveFrom", label: "Effective from", accessor: (row) => row.effectiveFrom, sortable: true, searchInput: "date" },
  { key: "effectiveTo", label: "Effective to", accessor: (row) => row.effectiveTo ?? "Current", sortable: true, searchInput: "date" },
];

const RATE_LIST = {
  columns: RATE_COLUMNS,
  selectionMode: "single",
  add: true,
  edit: false,
  delete: false,
} satisfies ListDefinition<BaseRateListRow>;

const TIER_COLUMNS: ColumnDef<QualityTierListRow>[] = [
  { key: "name", label: "Name", accessor: (row) => row.name, sortable: true, filter: "text", lov: false },
  { key: "bonusKind", label: "Bonus type", accessor: (row) => row.bonusKind, sortable: true, filter: "select" },
  { key: "bonusValue", label: "Value", accessor: (row) => Number(row.bonusValue), sortable: true, searchInput: "number", lov: false },
  { key: "sortOrder", label: "Rank", accessor: (row) => row.sortOrder, sortable: true, searchInput: "number", lov: false },
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
    <TabbedListSurface
      defaultTab="rates"
      tabs={[
        { id: "rates", label: "Base rates" },
        { id: "tiers", label: "Quality tiers" },
        { id: "deductions", label: "Deductions" },
      ]}
    >
      <BaseRatesList initialRows={rates} canManage={canManage} />
      <QualityTiersList initialRows={tiers} isOwner={isOwner} />
      <DeductionsSettings initialSettings={settings} canManage={canManage} />
    </TabbedListSurface>
  );
}

function BaseRatesList({ initialRows, canManage }: { initialRows: BaseRateListRow[]; canManage: boolean }) {
  const [adding, setAdding] = useState(false);
  const { rows, refreshing, mutationAction } = useFrameworkListData({
    initialRows,
    resource: { key: "payments.base-rates" },
  });
  const controls = useListControls(rows, RATE_LIST.columns);
  const visibleRows = controls.rows;
  const selection = useListSelection(rows, { mode: RATE_LIST.selectionMode, getId: (row) => row.id });
  const currentRate = rows.find((rate) => rate.effectiveTo === null);

  return (
    <ListSurface
      title="Base green-leaf rate"
      description="Effective-dated per-kg rates. Adding a rate closes the current period automatically without changing history."
      onCreate={() => setAdding(true)}
      canCreate={canManage && !adding}
      createDisabledReason={canManage ? "Finish adding the current rate first." : "Only owners and managers can set base rates."}
      createLabel="New rate"
      refreshing={refreshing}
    >
      <ListCommandToolbar mode={RATE_LIST.selectionMode} count={selection.selectedCount} />
      <div className="border-b border-stone-100 px-4 py-3 text-sm dark:border-stone-800">
        Current: <span className="font-semibold">{currentRate ? `${lkr(currentRate.pricePerKg)}/kg from ${currentRate.effectiveFrom}` : "not set"}</span>
      </div>
      <ListCreatePanel open={adding} title="Set a new base rate">
        <form action={mutationAction(saveBaseRate, { onSuccess: () => setAdding(false) })} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            New rate (LKR/kg)
            <input name="price_per_kg" type="number" step="0.01" min="0.01" required className={`${input} w-40`} />
          </label>
          <label className="text-sm">
            Effective from
            <input name="effective_from" type="date" defaultValue={today()} required className={`${input} w-44`} />
          </label>
          <SubmitButton pendingText="Saving…" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700">
            Set rate
          </SubmitButton>
          <button type="button" onClick={() => setAdding(false)} className="rounded-md border border-stone-300 px-4 py-2 text-sm dark:border-stone-600">
            Cancel
          </button>
        </form>
      </ListCreatePanel>
      <ListSearchPanel columns={RATE_LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              {RATE_LIST.columns.map((column) => (
                <th key={column.key} className={column.key === "pricePerKg" ? "px-4 py-3 text-right" : "px-4 py-3"}>
                  {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((rate) => (
              <tr
                key={rate.id}
                {...selection.rowProps(rate.id, adding || refreshing)}
                className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(rate.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
              >
                <td className="px-4 py-3 text-right font-medium tabular-nums">{lkr(rate.pricePerKg)}</td>
                <td className="px-4 py-3">{rate.effectiveFrom}</td>
                <td className="px-4 py-3">{rate.effectiveTo ?? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-300">Current</span>}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">{rows.length ? "No rates match these filters." : "No base rate history yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </ListSurface>
  );
}

function QualityTiersList({ initialRows, isOwner }: { initialRows: QualityTierListRow[]; isOwner: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { rows, refreshing, mutationAction } = useFrameworkListData({
    initialRows,
    resource: { key: "payments.quality-tiers" },
  });
  const controls = useListControls(rows, TIER_LIST.columns);
  const visibleRows = controls.rows;
  const selection = useListSelection(rows, { mode: TIER_LIST.selectionMode, getId: (row) => row.id });
  const selected = rows.find((row) => row.id === selection.selectedId) ?? null;
  const editing = rows.find((row) => row.id === editingId) ?? null;
  const changeDisabled = adding || Boolean(editingId) || refreshing;

  return (
    <ListSurface
      title="Quality tiers (superleaf)"
      description="Bonuses applied above the base rate. The factory owner controls this financial catalog."
      onCreate={() => setAdding(true)}
      canCreate={isOwner && !adding && !editingId}
      createDisabledReason={isOwner ? "Finish the current tier change first." : "Only the factory owner can add quality tiers."}
      createLabel="New tier"
      refreshing={refreshing}
    >
      <ListCommandToolbar
        mode={TIER_LIST.selectionMode}
        count={selection.selectedCount}
        enableEdit={isOwner && Boolean(TIER_LIST.edit)}
        onEdit={{
          onClick: () => setEditingId(selection.selectedId),
          disabled: !selection.selectedId || changeDisabled,
        }}
      >
        {editing && (
          <>
            <button type="button" onClick={() => setEditingId(null)} className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold dark:border-stone-600">
              Cancel
            </button>
            <button type="submit" form={`quality-tier-${editing.id}`} className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-600">
              Save changes
            </button>
          </>
        )}
        {isOwner && (
          <>
            <TierStatusCommand
              action={mutationAction(setTierActive, { onSuccess: selection.clear })}
              id={selection.selectedId}
              active={false}
              label={TIER_LIST.commands[0].label}
              disabled={changeDisabled || !selected?.active}
            />
            <TierStatusCommand
              action={mutationAction(setTierActive, { onSuccess: selection.clear })}
              id={selection.selectedId}
              active
              label={TIER_LIST.commands[1].label}
              disabled={changeDisabled || !selected || selected.active}
            />
          </>
        )}
      </ListCommandToolbar>

      <ListCreatePanel open={adding} title="Add a quality tier">
        <form action={mutationAction(saveTier, { onSuccess: () => setAdding(false) })} className="flex flex-wrap items-end gap-3">
          <TierFields defaultSortOrder={(rows.at(-1)?.sortOrder ?? 0) + 10} />
          <SubmitButton pendingText="Adding…" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700">
            Add tier
          </SubmitButton>
          <button type="button" onClick={() => setAdding(false)} className="rounded-md border border-stone-300 px-4 py-2 text-sm dark:border-stone-600">
            Cancel
          </button>
        </form>
      </ListCreatePanel>

      <ListSearchPanel columns={TIER_LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              {TIER_LIST.columns.map((column) => (
                <th key={column.key} className={column.key === "bonusValue" || column.key === "sortOrder" ? "px-4 py-3 text-right" : "px-4 py-3"}>
                  {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((tier) => {
              const isEditing = editingId === tier.id;
              const formId = `quality-tier-${tier.id}`;
              return (
                <tr
                  key={tier.id}
                  {...selection.rowProps(tier.id, adding || Boolean(editingId) || refreshing)}
                  className={`cursor-pointer border-b border-stone-100 align-top last:border-0 dark:border-stone-800 ${selection.isSelected(tier.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
                >
                  <td className="px-4 py-3 font-medium">
                    {isEditing ? (
                      <>
                        <form
                          id={formId}
                          action={mutationAction(saveTier, {
                            onSuccess: () => {
                              setEditingId(null);
                              selection.clear();
                            },
                          })}
                        >
                          <input type="hidden" name="id" value={tier.id} />
                        </form>
                        <input form={formId} name="name" aria-label="Tier name" defaultValue={tier.name} required className={compactInput} />
                      </>
                    ) : tier.name}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select form={formId} name="bonus_kind" aria-label="Bonus type" defaultValue={tier.bonusKind} className={compactInput}>
                        <option value="flat">Flat LKR/kg</option>
                        <option value="percent">% of base</option>
                      </select>
                    ) : tier.bonusKind === "percent" ? "% of base" : "Flat LKR/kg"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {isEditing ? <input form={formId} name="bonus_value" aria-label="Bonus value" type="number" step="0.01" min="0" defaultValue={tier.bonusValue} required className={`${compactInput} text-right`} /> : Number(tier.bonusValue).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {isEditing ? <input form={formId} name="sort_order" aria-label="Tier rank" type="number" step="1" defaultValue={tier.sortOrder} className={`${compactInput} text-right`} /> : tier.sortOrder}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${tier.active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"}`}>
                      {tier.active ? "active" : "inactive"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">{rows.length ? "No quality tiers match these filters." : "No quality tiers yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </ListSurface>
  );
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

function TierStatusCommand({
  action,
  id,
  active,
  label,
  disabled,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string | null;
  active: boolean;
  label: string;
  disabled: boolean;
}) {
  return (
    <form action={action}>
      {id && <input type="hidden" name="selected_ids" value={id} />}
      <input type="hidden" name="active" value={String(active)} />
      <SubmitButton
        pendingText="Updating…"
        disabled={disabled}
        className="min-h-10 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-green-50 hover:text-green-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-green-950 dark:hover:text-green-300"
      >
        {label}
      </SubmitButton>
    </form>
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
