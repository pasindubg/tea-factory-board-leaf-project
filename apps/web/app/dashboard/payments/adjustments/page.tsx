import { requireProfile } from "@/lib/profile";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { lkr } from "@/lib/money";
import { SubmitButton } from "@/components/submit-button";
import { addAdjustment, deleteAdjustment } from "../actions";

const input = "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none";
const todayStr = () => new Date().toISOString().slice(0, 10);

const KIND_LABELS: Record<string, string> = {
  advance: "Advance / loan",
  transport: "Transport",
  water_penalty: "Water penalty",
  other: "Other deduction",
  bonus: "One-off bonus",
};

type Supplier = { id: string; name: string };
type Adj = {
  id: string;
  kind: string;
  label: string | null;
  amount: string | null;
  percent: string | null;
  occurred_on: string;
  suppliers: { name: string } | null;
};

export default async function AdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { supabase } = await requireProfile(MANAGEMENT_ROLES);
  const { error, notice } = await searchParams;

  const [{ data: suppliers }, { data: adjustments }, { data: settings }] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
    supabase
      .from("supplier_adjustments")
      .select("id, kind, label, amount, percent, occurred_on, suppliers(name)")
      .order("occurred_on", { ascending: false })
      .limit(50),
    supabase.from("payment_settings").select("default_water_penalty_pct").maybeSingle(),
  ]);
  const supplierRows = (suppliers ?? []) as Supplier[];
  const adjRows = (adjustments ?? []) as unknown as Adj[];
  const waterDefault = (settings as { default_water_penalty_pct: string } | null)?.default_water_penalty_pct ?? "0";

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 p-3 text-sm text-green-800" role="status">{notice}</p>}

      <section className="rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-stone-800">Add an advance or deduction</h2>
        <p className="mt-1 text-sm text-stone-500">
          Applied to the supplier&apos;s statement for the month of the date below. Use a percentage for a water penalty
          (a % of that month&apos;s leaf value); use an amount for advances, transport, or other cuts. A one-off bonus
          adds to the payment.
        </p>
        <form action={addAdjustment} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Supplier
            <select name="supplier_id" required defaultValue="" className={`${input} w-52`}>
              <option value="" disabled>Select supplier</option>
              {supplierRows.map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Kind
            <select name="kind" required defaultValue="advance" className={`${input} w-44`}>
              {Object.entries(KIND_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Mode
            <select name="mode" defaultValue="amount" className={`${input} w-36`}>
              <option value="amount">Amount (LKR)</option>
              <option value="percent">Percent (%)</option>
            </select>
          </label>
          <label className="text-sm">
            Value
            <input name="value" type="number" step="0.01" min="0.01" required placeholder={`e.g. ${waterDefault}`} className={`${input} w-28`} />
          </label>
          <label className="text-sm">
            Label
            <input name="label" placeholder="optional" className={`${input} w-40`} />
          </label>
          <label className="text-sm">
            Date
            <input name="occurred_on" type="date" defaultValue={todayStr()} required className={`${input} w-44`} />
          </label>
          <SubmitButton pendingText="Adding…" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
            Add
          </SubmitButton>
        </form>
        <p className="mt-2 text-xs text-stone-500">Default water penalty (from Settings): {waterDefault}%</p>
      </section>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Detail</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {adjRows.map((a) => (
              <tr key={a.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-3 text-stone-500">{a.occurred_on}</td>
                <td className="px-4 py-3 font-medium">{a.suppliers?.name ?? "—"}</td>
                <td className="px-4 py-3">{KIND_LABELS[a.kind] ?? a.kind}</td>
                <td className="px-4 py-3 text-stone-500">{a.label ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {a.percent != null ? `${Number(a.percent).toFixed(2)}%` : lkr(a.amount)}
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={deleteAdjustment}>
                    <input type="hidden" name="id" value={a.id} />
                    <SubmitButton pendingText="…" className="text-sm text-red-700 hover:underline">Remove</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
            {adjRows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400">No advances or deductions recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
