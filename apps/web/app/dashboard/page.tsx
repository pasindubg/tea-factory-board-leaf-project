import { requireModuleAccess } from "@/lib/profile";
import { dayRange, lastNDates, localDateString } from "@/lib/dates";
import { IntakeChart } from "@/components/intake-chart";
import { CollectorIntakeList, RecentWeighingsList } from "./dashboard-lists";

export default async function DashboardPage() {
  const { supabase } = await requireModuleAccess("overview");

  const today = localDateString();
  const todayRange = dayRange(today);
  const week = lastNDates(7);
  const weekStart = dayRange(week[0]).start;

  const [{ data: todayWeighings }, { count: supplierCount }, { data: weekWeighings }, { data: recent }] =
    await Promise.all([
      supabase
        .from("weighings")
        .select("weight_kg, collector_id, collectors(name)")
        .gte("collected_at", todayRange.start)
        .lt("collected_at", todayRange.end),
      supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("weighings").select("weight_kg, collected_at").gte("collected_at", weekStart),
      supabase
        .from("weighings")
        .select("id, weight_kg, collected_at, suppliers(name), collectors(name)")
        .order("collected_at", { ascending: false })
        .limit(5),
    ]);

  const todayTotal = (todayWeighings ?? []).reduce((sum, w) => sum + Number(w.weight_kg), 0);

  const byCollector = new Map<string, number>();
  for (const w of todayWeighings ?? []) {
    const name = (w.collectors as unknown as { name: string } | null)?.name ?? "Unknown";
    byCollector.set(name, (byCollector.get(name) ?? 0) + Number(w.weight_kg));
  }

  const byDay = new Map(week.map((d) => [d, 0]));
  for (const w of weekWeighings ?? []) {
    const d = localDateString(new Date(w.collected_at));
    if (byDay.has(d)) byDay.set(d, (byDay.get(d) ?? 0) + Number(w.weight_kg));
  }
  const chartData = week.map((d) => ({
    day: new Date(`${d}T00:00:00`).toLocaleDateString([], { weekday: "short" }),
    kg: Number((byDay.get(d) ?? 0).toFixed(2)),
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{new Date().toLocaleDateString([], { dateStyle: "full" })}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5">
          <p className="text-sm text-stone-500 dark:text-stone-400">Today&apos;s intake</p>
          <p className="mt-2 text-2xl font-semibold">
            {todayTotal.toFixed(2)} <span className="text-base font-normal text-stone-400 dark:text-stone-500">kg</span>
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5">
          <p className="text-sm text-stone-500 dark:text-stone-400">Weighings today</p>
          <p className="mt-2 text-2xl font-semibold">{(todayWeighings ?? []).length}</p>
        </div>
        <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5">
          <p className="text-sm text-stone-500 dark:text-stone-400">Active suppliers</p>
          <p className="mt-2 text-2xl font-semibold">{supplierCount ?? 0}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5 lg:col-span-2">
          <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">Intake — last 7 days</h2>
          <div className="mt-4">
            <IntakeChart data={chartData} />
          </div>
        </div>
        <CollectorIntakeList rows={[...byCollector.entries()].map(([name, kg]) => ({ id: name, name, kg }))} />
      </div>

      <div className="mt-6"><RecentWeighingsList rows={(recent ?? []).map((weighing) => ({
        id: weighing.id as string,
        supplier: (weighing.suppliers as unknown as { name: string } | null)?.name ?? "—",
        collector: (weighing.collectors as unknown as { name: string } | null)?.name ?? "—",
        collectedAt: weighing.collected_at as string,
        weightKg: Number(weighing.weight_kg),
      }))} /></div>
    </div>
  );
}
