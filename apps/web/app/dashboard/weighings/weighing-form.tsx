"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { createWeighing } from "./actions";

const inputClass =
  "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none";

type Supplier = { id: string; name: string; area: string | null };
type Collector = { id: string; name: string };
type Tier = { id: string; name: string };

function localDatetimeValue(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  const offset = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

export function WeighingForm({
  suppliers,
  collectors,
  tiers,
  assignments,
  isCollector,
  ownCollectorName,
  transportPerKg,
  waterPenaltyLabel,
  error,
}: {
  suppliers: Supplier[];
  collectors: Collector[];
  tiers: Tier[];
  assignments: Map<string, string>;
  isCollector: boolean;
  ownCollectorName?: string;
  transportPerKg: number;
  waterPenaltyLabel: string | null; // e.g. "10%" or "LKR 5.00/kg"; null = penalty not configured
  error?: string;
}) {
  const [tierId, setTierId] = useState("");
  const [weightKg, setWeightKg] = useState("");

  function onSupplierChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setTierId(assignments.get(e.target.value) ?? "");
  }

  const transportDeduction = transportPerKg > 0 && Number(weightKg) > 0
    ? (transportPerKg * Number(weightKg)).toFixed(2)
    : null;

  return (
    <form action={createWeighing} className="mt-6 max-w-lg space-y-4 rounded-xl border border-stone-200 bg-white p-6">
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <label className="block text-sm font-medium">
        Supplier *
        <select name="supplier_id" required defaultValue="" onChange={onSupplierChange} className={inputClass}>
          <option value="" disabled>Select supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{s.area ? ` (${s.area})` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium">
        Weight (kg) *
        <input
          name="weight_kg"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
          className={inputClass}
        />
      </label>

      {/* Transport — on by default; untick for suppliers who delivered direct */}
      {transportPerKg > 0 && (
        <label className="flex items-start gap-2 rounded-md bg-stone-50 px-3 py-2 text-sm font-medium">
          <input name="transport_applies" type="checkbox" value="1" defaultChecked className="mt-0.5 h-4 w-4" />
          <span>
            Deduct transport (LKR {transportPerKg}/kg)
            {transportDeduction && <span className="ml-1 text-stone-800">= LKR {transportDeduction}</span>}
            <span className="mt-0.5 block text-xs font-normal text-stone-400">
              Untick if the supplier delivered the leaf to the factory themselves.
            </span>
          </span>
        </label>
      )}

      {/* Water penalty — a tick at intake; the uniform rate is set by the owner */}
      {waterPenaltyLabel && (
        <label className="flex items-start gap-2 rounded-md bg-stone-50 px-3 py-2 text-sm font-medium">
          <input name="water_penalty" type="checkbox" value="1" className="mt-0.5 h-4 w-4" />
          <span>
            Leaf is wet — apply water penalty
            <span className="mt-0.5 block text-xs font-normal text-stone-400">
              Standard penalty ({waterPenaltyLabel}) applied to this delivery at payment.
            </span>
          </span>
        </label>
      )}

      {tiers.length > 0 && (
        <label className="block text-sm font-medium">
          Quality tier
          <select
            name="tier_id"
            value={tierId}
            onChange={(e) => setTierId(e.target.value)}
            className={inputClass}
          >
            <option value="">Standard (no tier)</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-stone-400">
            Pre-filled from the supplier&apos;s current tier. Changing it updates their assignment from today.
          </p>
        </label>
      )}

      {isCollector ? (
        <p className="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-600">
          Recording as <span className="font-medium">{ownCollectorName}</span>
        </p>
      ) : (
        <label className="block text-sm font-medium">
          Collector *
          <select name="collector_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>Select collector</option>
            {collectors.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      <label className="block text-sm font-medium">
        Collected at
        <input name="collected_at" type="datetime-local" defaultValue={localDatetimeValue()} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Notes
        <input name="notes" className={inputClass} />
      </label>
      <div className="flex gap-3 pt-2">
        <SubmitButton
          pendingText="Recording…"
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          Record weighing
        </SubmitButton>
        <a href="/dashboard/weighings" className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100">
          Cancel
        </a>
      </div>
    </form>
  );
}
