import { collectorForUser, requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES } from "@/lib/roles";
import { WeighingForm } from "../weighing-form";

export default async function NewWeighingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);
  const { error } = await searchParams;

  const isCollector = profile.role === "collector";

  const [{ data: suppliers }, { data: collectors }, { data: tiers }, { data: assignments }, { data: settings }, ownCollector] =
    await Promise.all([
      supabase.from("suppliers").select("id, name, area").eq("active", true).order("name"),
      isCollector
        ? Promise.resolve({ data: [] as { id: string; name: string }[] })
        : supabase.from("collectors").select("id, name").neq("active", false).order("name"),
      supabase.from("quality_tiers").select("id, name").eq("active", true).order("sort_order"),
      supabase.from("supplier_tiers").select("supplier_id, tier_id").is("effective_to", null),
      supabase.from("payment_settings").select("transport_per_kg, default_water_penalty_pct").maybeSingle(),
      isCollector ? collectorForUser(supabase, profile.id) : Promise.resolve(null),
    ]);

  if (isCollector && !ownCollector) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Record weighing</h1>
        <p className="mt-6 max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Your login has no collector record yet, so weighings can&apos;t be attributed to you. Ask the
          factory owner to link one on the Collectors page.
        </p>
      </div>
    );
  }

  if (!isCollector && (collectors ?? []).length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Record weighing</h1>
        <p className="mt-6 max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No collectors are set up yet. Every weighing must be attributed to a collector.{" "}
          <a href="/dashboard/collectors/new" className="font-medium underline">
            Add a collector
          </a>{" "}
          first, then come back to record weighings.
        </p>
      </div>
    );
  }

  const assignmentMap = new Map(
    (assignments ?? []).map((a) => [a.supplier_id, a.tier_id]),
  );
  const s = settings as { transport_per_kg: string; default_water_penalty_pct: string } | null;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Record weighing</h1>
      <WeighingForm
        suppliers={(suppliers ?? []) as { id: string; name: string; area: string | null }[]}
        collectors={(collectors ?? []) as { id: string; name: string }[]}
        tiers={(tiers ?? []) as { id: string; name: string }[]}
        assignments={assignmentMap}
        isCollector={isCollector}
        ownCollectorName={ownCollector?.name}
        transportPerKg={Number(s?.transport_per_kg ?? 0)}
        defaultWaterPenaltyPct={Number(s?.default_water_penalty_pct ?? 0)}
        error={error}
      />
    </div>
  );
}
