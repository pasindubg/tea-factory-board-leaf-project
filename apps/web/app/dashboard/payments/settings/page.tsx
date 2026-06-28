import { requireProfile } from "@/lib/profile";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { lkr } from "@/lib/money";
import { SubmitButton } from "@/components/submit-button";
import { saveBaseRate, saveSettings, saveTier, setTierActive } from "../actions";

const input = "mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm focus:border-green-600 dark:focus:border-green-500 focus:outline-none";
const todayStr = () => new Date().toISOString().slice(0, 10);

type Rate = { price_per_kg: string; effective_from: string; effective_to: string | null };
type Tier = { id: string; name: string; bonus_kind: string; bonus_value: string; sort_order: number; active: boolean };
type Settings = {
  transport_per_kg: string;
  water_penalty_mode: "per_kg" | "percent";
  water_penalty_per_kg: string;
  default_water_penalty_pct: string;
} | null;

export default async function PaymentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { supabase } = await requireProfile(MANAGEMENT_ROLES);
  const { error, notice } = await searchParams;

  const [{ data: rates }, { data: tiers }, { data: settings }] = await Promise.all([
    supabase.from("price_rates").select("price_per_kg, effective_from, effective_to").eq("grade", "GREEN_LEAF").order("effective_from", { ascending: false }),
    supabase.from("quality_tiers").select("id, name, bonus_kind, bonus_value, sort_order, active").order("sort_order"),
    supabase.from("payment_settings").select("transport_per_kg, water_penalty_mode, water_penalty_per_kg, default_water_penalty_pct").maybeSingle(),
  ]);
  const rateRows = (rates ?? []) as Rate[];
  const tierRows = (tiers ?? []) as Tier[];
  const s = settings as Settings;
  const currentRate = rateRows.find((r) => r.effective_to === null);

  return (
    <div className="space-y-8">
      {error && <p className="rounded-md bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-400" role="alert">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 dark:bg-green-950 p-3 text-sm text-green-800 dark:text-green-400" role="status">{notice}</p>}

      {/* Base green-leaf rate */}
      <section className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-6">
        <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Base green-leaf rate</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          The per-kg rate every supplier earns. Quality tiers add a bonus on top. Setting a new rate closes the current
          one automatically (effective-dated, so past months recompute correctly).
        </p>
        <p className="mt-3 text-sm">
          Current:{" "}
          <span className="font-medium">
            {currentRate ? `${lkr(currentRate.price_per_kg)}/kg from ${currentRate.effective_from}` : "not set"}
          </span>
        </p>
        <form action={saveBaseRate} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            New rate (LKR/kg)
            <input name="price_per_kg" type="number" step="0.01" min="0.01" required className={`${input} w-40`} />
          </label>
          <label className="text-sm">
            Effective from
            <input name="effective_from" type="date" defaultValue={todayStr()} required className={`${input} w-44`} />
          </label>
          <SubmitButton pendingText="Saving…" className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700">
            Set rate
          </SubmitButton>
        </form>
      </section>

      {/* Quality tiers */}
      <section className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-6">
        <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Quality tiers (superleaf)</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Each tier adds a bonus on top of the base rate — flat LKR/kg or a percentage of the base. Always a bonus, never
          a cut. Higher rank = better tier; the top tier drives the &ldquo;bonus missed&rdquo; figure on statements.
        </p>

        <div className="mt-4 space-y-2">
          {tierRows.map((t) => (
            <form
              key={t.id}
              action={saveTier}
              className="flex flex-wrap items-end gap-2 rounded-md border border-stone-200 dark:border-stone-700 p-3"
            >
              <input type="hidden" name="id" value={t.id} />
              <label className="text-xs text-stone-500 dark:text-stone-400">
                Name
                <input name="name" defaultValue={t.name} className={`${input} w-36`} />
              </label>
              <label className="text-xs text-stone-500 dark:text-stone-400">
                Bonus type
                <select name="bonus_kind" defaultValue={t.bonus_kind} className={`${input} w-32`}>
                  <option value="flat">Flat LKR/kg</option>
                  <option value="percent">% of base</option>
                </select>
              </label>
              <label className="text-xs text-stone-500 dark:text-stone-400">
                Value
                <input name="bonus_value" type="number" step="0.01" min="0" defaultValue={t.bonus_value} className={`${input} w-24`} />
              </label>
              <label className="text-xs text-stone-500 dark:text-stone-400">
                Rank
                <input name="sort_order" type="number" defaultValue={t.sort_order} className={`${input} w-20`} />
              </label>
              <SubmitButton pendingText="…" className="rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-800">Save</SubmitButton>
              {!t.active && <span className="self-center text-xs text-stone-400 dark:text-stone-500">inactive</span>}
              <SubmitButton
                formAction={setTierActive}
                name="active"
                value={t.active ? "false" : "true"}
                pendingText="…"
                className="ml-auto self-center text-sm text-stone-600 dark:text-stone-400 hover:underline"
              >
                {t.active ? "Deactivate" : "Reactivate"}
              </SubmitButton>
              <input type="hidden" name="id" value={t.id} />
            </form>
          ))}
          {tierRows.length === 0 && <p className="text-sm text-stone-400 dark:text-stone-500">No tiers yet — add Standard and Superleaf below.</p>}
        </div>

        <form action={saveTier} className="mt-4 flex flex-wrap items-end gap-2 border-t border-stone-100 dark:border-stone-800 pt-4">
          <label className="text-xs text-stone-500 dark:text-stone-400">
            New tier name
            <input name="name" placeholder="Superleaf" required className={`${input} w-36`} />
          </label>
          <label className="text-xs text-stone-500 dark:text-stone-400">
            Bonus type
            <select name="bonus_kind" defaultValue="flat" className={`${input} w-32`}>
              <option value="flat">Flat LKR/kg</option>
              <option value="percent">% of base</option>
            </select>
          </label>
          <label className="text-xs text-stone-500 dark:text-stone-400">
            Value
            <input name="bonus_value" type="number" step="0.01" min="0" defaultValue="0" required className={`${input} w-24`} />
          </label>
          <label className="text-xs text-stone-500 dark:text-stone-400">
            Rank
            <input name="sort_order" type="number" defaultValue={(tierRows.at(-1)?.sort_order ?? 0) + 10} className={`${input} w-20`} />
          </label>
          <SubmitButton pendingText="Adding…" className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700">
            Add tier
          </SubmitButton>
        </form>
      </section>

      {/* Deduction defaults */}
      <section className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-6">
        <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Deductions</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Transport is applied to every supplier&apos;s kg automatically (0 = none). The water penalty is uniform across
          suppliers — set the mode and rate here; at the weighbridge the recorder just ticks &ldquo;leaf is wet&rdquo; and
          it is charged on that delivery only.
        </p>
        <form action={saveSettings} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Transport (LKR/kg)
            <input name="transport_per_kg" type="number" step="0.01" min="0" defaultValue={s?.transport_per_kg ?? "0"} className={`${input} w-40`} />
          </label>
          <label className="text-sm">
            Water penalty mode
            <select name="water_penalty_mode" defaultValue={s?.water_penalty_mode ?? "percent"} className={`${input} w-44`}>
              <option value="percent">% of delivery value</option>
              <option value="per_kg">Flat LKR/kg</option>
            </select>
          </label>
          <label className="text-sm">
            Penalty rate (%)
            <input name="default_water_penalty_pct" type="number" step="0.01" min="0" max="100" defaultValue={s?.default_water_penalty_pct ?? "0"} className={`${input} w-32`} />
          </label>
          <label className="text-sm">
            Penalty rate (LKR/kg)
            <input name="water_penalty_per_kg" type="number" step="0.01" min="0" defaultValue={s?.water_penalty_per_kg ?? "0"} className={`${input} w-36`} />
          </label>
          <SubmitButton pendingText="Saving…" className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700">
            Save defaults
          </SubmitButton>
        </form>
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          Fill the field matching the selected mode. The other is ignored.
        </p>
      </section>
    </div>
  );
}
