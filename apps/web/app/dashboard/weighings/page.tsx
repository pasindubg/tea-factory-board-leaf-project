import Link from "next/link";
import { collectorForUser, requireModuleAccess } from "@/lib/profile";
import { dayRange } from "@/lib/dates";
import { WeighingsFilter } from "./weighings-filter";

export default async function WeighingsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; supplier?: string; collector?: string }>;
}) {
  const { supabase, profile } = await requireModuleAccess("weighings");
  const params = await searchParams;

  const isCollector = profile.role === "collector";
  const ownCollector = isCollector ? await collectorForUser(supabase, profile.id) : null;
  const collectorFilter = isCollector ? (ownCollector?.id ?? "none") : params.collector;

  let query = supabase
    .from("weighings")
    .select("id, weight_kg, collected_at, notes, suppliers(name), collectors(name)")
    .order("collected_at", { ascending: false });
  if (params.from) query = query.gte("collected_at", dayRange(params.from).start);
  if (params.to) query = query.lt("collected_at", dayRange(params.to).end);
  if (params.supplier) query = query.eq("supplier_id", params.supplier);
  if (collectorFilter) query = query.eq("collector_id", collectorFilter);

  const [{ data: weighings }, { data: suppliers }, { data: collectors }] = await Promise.all([
    query,
    supabase.from("suppliers").select("id, name").order("name"),
    isCollector
      ? Promise.resolve({ data: [] as { id: string; name: string }[] })
      : supabase.from("collectors").select("id, name").neq("active", false).order("name"),
  ]);

  const totalKg = (weighings ?? []).reduce((sum, w) => sum + Number(w.weight_kg), 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Weighings</h1>
          {isCollector && ownCollector && (
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Your records — {ownCollector.name}</p>
          )}
        </div>
        <Link
          href="/dashboard/weighings/new"
          className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
        >
          Record weighing
        </Link>
      </div>

      <WeighingsFilter
        from={params.from}
        to={params.to}
        supplierId={params.supplier}
        collectorId={params.collector}
        suppliers={(suppliers ?? []) as { id: string; name: string }[]}
        collectors={(collectors ?? []) as { id: string; name: string }[]}
        isCollector={isCollector}
      />

      <div className="mt-2 flex justify-end">
        <span className="rounded-md bg-green-50 dark:bg-green-950 px-3 py-1.5 text-sm font-medium text-green-800 dark:text-green-400">
          Total: {totalKg.toFixed(2)} kg ({(weighings ?? []).length} records)
        </span>
      </div>

      <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Collector</th>
              <th className="px-4 py-3 text-right">Weight (kg)</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {(weighings ?? []).map((w) => (
              <tr key={w.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                <td className="px-4 py-3">
                  {new Date(w.collected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-4 py-3 font-medium">
                  {(w.suppliers as unknown as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="px-4 py-3">{(w.collectors as unknown as { name: string } | null)?.name ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{Number(w.weight_kg).toFixed(2)}</td>
                <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{w.notes ?? ""}</td>
              </tr>
            ))}
            {(weighings ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                  No weighings found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
