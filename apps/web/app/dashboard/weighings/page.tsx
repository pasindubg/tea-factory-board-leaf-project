import { collectorForUser, requirePageAccess } from "@/lib/profile";
import { friendlyError } from "@/lib/errors";
import { loadListResource } from "@/lib/list-resource-registry";
import { WeighingsFilter } from "./weighings-filter";
import { WeighingsTable } from "./weighings-table";

export default async function WeighingsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; supplier?: string; collector?: string }>;
}) {
  const { supabase, profile } = await requirePageAccess("weighings");
  const params = await searchParams;
  const isCollector = profile.role === "collector";
  const ownCollector = isCollector ? await collectorForUser(supabase, profile.id) : null;
  const resourceParams = {
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
    ...(params.supplier ? { supplierId: params.supplier } : {}),
    ...(!isCollector && params.collector ? { collectorId: params.collector } : {}),
  };

  const [
    weighingResource,
    { data: suppliers, error: supplierError },
    { data: collectors, error: collectorError },
    { data: tiers, error: tierError },
    { data: assignments, error: assignmentError },
    { data: settings, error: settingsError },
  ] = await Promise.all([
    loadListResource({ key: "leaf.weighings", params: resourceParams }),
    supabase.from("suppliers").select("id, name, area").eq("active", true).order("name"),
    isCollector
      ? Promise.resolve({ data: [] as { id: string; name: string }[], error: null })
      : supabase.from("collectors").select("id, name").neq("active", false).order("name"),
    supabase.from("quality_tiers").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("supplier_tiers").select("supplier_id, tier_id").is("effective_to", null),
    supabase.from("payment_settings").select("transport_per_kg, water_penalty_mode, water_penalty_per_kg, default_water_penalty_pct").maybeSingle(),
  ]);
  if (!weighingResource.ok) throw new Error(weighingResource.error);
  const optionError = supplierError ?? collectorError ?? tierError ?? assignmentError ?? settingsError;
  if (optionError) throw new Error(friendlyError(optionError));

  const supplierRows = (suppliers ?? []) as { id: string; name: string; area: string | null }[];
  const collectorRows = (collectors ?? []) as { id: string; name: string }[];
  const settingsRow = settings as {
    transport_per_kg: string;
    water_penalty_mode: "per_kg" | "percent";
    water_penalty_per_kg: string;
    default_water_penalty_pct: string;
  } | null;
  const waterPerKg = Number(settingsRow?.water_penalty_per_kg ?? 0);
  const waterPercent = Number(settingsRow?.default_water_penalty_pct ?? 0);
  const waterPenaltyLabel = settingsRow?.water_penalty_mode === "per_kg"
    ? waterPerKg > 0 ? `LKR ${waterPerKg.toFixed(2)}/kg` : null
    : waterPercent > 0 ? `${waterPercent}%` : null;
  const canCreate = supplierRows.length > 0 && (isCollector ? Boolean(ownCollector) : collectorRows.length > 0);
  const disabledReason = supplierRows.length === 0
    ? "Add an active supplier before recording a weighing."
    : isCollector && !ownCollector
      ? "Your login needs a linked collector record."
      : collectorRows.length === 0
        ? "Add an active collector before recording a weighing."
        : undefined;

  return (
    <div className="space-y-4">
      {isCollector && ownCollector && <p className="text-sm text-stone-500 dark:text-stone-400">Your records — {ownCollector.name}</p>}
      <WeighingsFilter
        from={params.from}
        to={params.to}
        supplierId={params.supplier}
        collectorId={params.collector}
        suppliers={supplierRows}
        collectors={collectorRows}
        isCollector={isCollector}
      />
      <WeighingsTable
        rows={weighingResource.rows}
        resourceParams={resourceParams}
        createOptions={{
          suppliers: supplierRows,
          collectors: collectorRows,
          tiers: (tiers ?? []) as { id: string; name: string }[],
          assignments: new Map((assignments ?? []).map((assignment) => [assignment.supplier_id as string, assignment.tier_id as string])),
          isCollector,
          ownCollectorName: ownCollector?.name,
          transportPerKg: Number(settingsRow?.transport_per_kg ?? 0),
          waterPenaltyLabel,
          canCreate,
          disabledReason,
        }}
      />
    </div>
  );
}
