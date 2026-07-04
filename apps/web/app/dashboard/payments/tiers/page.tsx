import Link from "next/link";
import { requireProfile } from "@/lib/profile";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { SubmitButton } from "@/components/submit-button";
import { assignTier } from "../actions";
import { TierAssignmentsTable, type TierAssignmentRow } from "./tier-assignments-table";

const input = "mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm focus:border-green-600 dark:focus:border-green-500 focus:outline-none";
const todayStr = () => new Date().toISOString().slice(0, 10);

type Supplier = { id: string; name: string; area: string | null };
type Tier = { id: string; name: string };
type Assignment = {
  supplier_id: string;
  effective_from: string;
  source: string;
  quality_tiers: { name: string } | null;
};

export default async function TiersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { supabase } = await requireProfile(MANAGEMENT_ROLES);
  const { error, notice } = await searchParams;

  const [{ data: suppliers }, { data: tiers }, { data: assignments }] = await Promise.all([
    supabase.from("suppliers").select("id, name, area").eq("active", true).order("name"),
    supabase.from("quality_tiers").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("supplier_tiers").select("supplier_id, effective_from, source, quality_tiers(name)").is("effective_to", null),
  ]);
  const supplierRows = (suppliers ?? []) as Supplier[];
  const tierRows = (tiers ?? []) as Tier[];
  const current = new Map<string, Assignment>();
  for (const a of (assignments ?? []) as unknown as Assignment[]) current.set(a.supplier_id, a);

  const tableRows: TierAssignmentRow[] = supplierRows.map((sp) => {
    const a = current.get(sp.id);
    return {
      id: sp.id,
      supplierName: sp.name,
      area: sp.area,
      tierName: a?.quality_tiers?.name ?? null,
      effectiveFrom: a?.effective_from ?? null,
      source: a?.source ?? null,
    };
  });

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-400" role="alert">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 dark:bg-green-950 p-3 text-sm text-green-800 dark:text-green-400" role="status">{notice}</p>}

      {tierRows.length === 0 ? (
        <p className="rounded-md bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-800 dark:text-amber-400">
          No active quality tiers yet. Add them under <Link href="/dashboard/payments/settings" className="underline">Settings</Link> first.
        </p>
      ) : (
        <section className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-6">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Assign a supplier to a tier</h2>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Effective-dated, so it only affects weighings from that date forward. Assigning closes the supplier&apos;s
            previous tier automatically. (M7/M8 will add evidence-based auto-scoring; for now this is your call.)
          </p>
          <form action={assignTier} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              Supplier
              <select name="supplier_id" required defaultValue="" className={`${input} w-56`}>
                <option value="" disabled>Select supplier</option>
                {supplierRows.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.name}{sp.area ? ` (${sp.area})` : ""}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Tier
              <select name="tier_id" required defaultValue="" className={`${input} w-44`}>
                <option value="" disabled>Select tier</option>
                {tierRows.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Effective from
              <input name="effective_from" type="date" defaultValue={todayStr()} required className={`${input} w-44`} />
            </label>
            <label className="text-sm">
              Note
              <input name="note" placeholder="optional" className={`${input} w-44`} />
            </label>
            <SubmitButton pendingText="Assigning…" className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700">
              Assign
            </SubmitButton>
          </form>
        </section>
      )}

      <TierAssignmentsTable rows={tableRows} />
    </div>
  );
}
