import { friendlyError } from "@/lib/errors";
import { loadListResource } from "@/lib/list-resource-registry";
import { requirePageAccess } from "@/lib/profile";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { AdjustmentsTable } from "./adjustments-table";

export default async function AdjustmentsPage() {
  const { supabase, profile } = await requirePageAccess("payment-adjustments");
  const [
    adjustmentResource,
    { data: suppliers, error: supplierError },
    { data: settings, error: settingsError },
  ] = await Promise.all([
    loadListResource({ key: "payments.adjustments" }),
    supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
    supabase.from("payment_settings").select("default_water_penalty_pct").maybeSingle(),
  ]);
  if (!adjustmentResource.ok) throw new Error(adjustmentResource.error);
  const optionError = supplierError ?? settingsError;
  if (optionError) throw new Error(friendlyError(optionError));

  return <AdjustmentsTable
    rows={adjustmentResource.rows}
    suppliers={(suppliers ?? []).map((supplier) => ({ id: supplier.id as string, name: supplier.name as string }))}
    waterDefault={(settings as { default_water_penalty_pct: string } | null)?.default_water_penalty_pct ?? "0"}
    canManage={MANAGEMENT_ROLES.includes(profile.role)}
  />;
}
