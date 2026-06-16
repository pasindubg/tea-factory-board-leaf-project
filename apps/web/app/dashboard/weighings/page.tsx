import { collectorForUser, requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES } from "@/lib/roles";
import { dayRange, isValidDateString, localDateString } from "@/lib/dates";

const inputClass = "rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-green-600 focus:outline-none";

export default async function WeighingsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; supplier?: string; collector?: string }>;
}) {
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);
  const params = await searchParams;
  const date = params.date && isValidDateString(params.date) ? params.date : localDateString();
  const { start, end } = dayRange(date);

  // Collectors see only their own records, regardless of query params.
  const isCollector = profile.role === "collector";
  const ownCollector = isCollector ? await collectorForUser(supabase, profile.id) : null;
  const collectorFilter = isCollector ? (ownCollector?.id ?? "none") : params.collector;

  let query = supabase
    .from("weighings")
    .select("id, weight_kg, collected_at, notes, suppliers(name), collectors(name)")
    .gte("collected_at", start)
    .lt("collected_at", end)
    .order("collected_at", { ascending: false });
  if (params.supplier) query = query.eq("supplier_id", params.supplier);
  if (collectorFilter) query = query.eq("collector_id", collectorFilter);

  const [{ data: weighings }, { data: suppliers }, { data: collectors }] = await Promise.all([
    query,
    supabase.from("suppliers").select("id, name").order("name"),
    isCollector
      ? Promise.resolve({ data: [] as { id: string; name: string }[] })
      : supabase.from("collectors").select("id, name").order("name"),
  ]);

  const totalKg = (weighings ?? []).reduce((sum, w) => sum + Number(w.weight_kg), 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Weighings</h1>
          {isCollector && ownCollector && (
            <p className="mt-1 text-sm text-stone-500">Your records — {ownCollector.name}</p>
          )}
        </div>
        <a
          href="/dashboard/weighings/new"
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          Record weighing
        </a>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Date
          <input type="date" name="date" defaultValue={date} className={`${inputClass} mt-1 block`} />
        </label>
        <label className="text-sm">
          Supplier
          <select name="supplier" defaultValue={params.supplier ?? ""} className={`${inputClass} mt-1 block`}>
            <option value="">All suppliers</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {!isCollector && (
          <label className="text-sm">
            Collector
            <select name="collector" defaultValue={params.collector ?? ""} className={`${inputClass} mt-1 block`}>
              <option value="">All collectors</option>
              {(collectors ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="rounded-md border border-stone-300 px-4 py-1.5 text-sm hover:bg-stone-100">Filter</button>
        <span className="ml-auto rounded-md bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800">
          Total: {totalKg.toFixed(2)} kg ({(weighings ?? []).length} records)
        </span>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Collector</th>
              <th className="px-4 py-3 text-right">Weight (kg)</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {(weighings ?? []).map((w) => (
              <tr key={w.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-3">
                  {new Date(w.collected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-4 py-3 font-medium">
                  {(w.suppliers as unknown as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="px-4 py-3">{(w.collectors as unknown as { name: string } | null)?.name ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{Number(w.weight_kg).toFixed(2)}</td>
                <td className="px-4 py-3 text-stone-500">{w.notes ?? ""}</td>
              </tr>
            ))}
            {(weighings ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-400">
                  No weighings for this day.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
