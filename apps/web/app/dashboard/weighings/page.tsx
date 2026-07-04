import Link from "next/link";
import { collectorForUser, requireModuleAccess } from "@/lib/profile";
import { dayRange } from "@/lib/dates";
import { WeighingsFilter } from "./weighings-filter";
import { WeighingsTable, type WeighingRow } from "./weighings-table";

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

  const rows: WeighingRow[] = (weighings ?? []).map((w) => ({
    id: w.id,
    collectedAt: w.collected_at,
    supplierName: (w.suppliers as unknown as { name: string } | null)?.name ?? "—",
    collectorName: (w.collectors as unknown as { name: string } | null)?.name ?? "—",
    weightKg: Number(w.weight_kg),
    notes: w.notes,
  }));

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

      <div className="mt-2">
        <WeighingsTable rows={rows} />
      </div>
    </div>
  );
}
