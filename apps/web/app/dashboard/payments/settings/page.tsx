import { friendlyError } from "@/lib/errors";
import { loadListResource } from "@/lib/list-resource-registry";
import { requireModuleAccess } from "@/lib/profile";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { PaymentSettingsLists, type PaymentSettingsValues } from "./payment-settings-lists";

export default async function PaymentSettingsPage() {
  const { supabase, profile } = await requireModuleAccess("payments");
  const [rateResource, tierResource, { data: settings, error: settingsError }] = await Promise.all([
    loadListResource({ key: "payments.base-rates" }),
    loadListResource({ key: "payments.quality-tiers" }),
    supabase
      .from("payment_settings")
      .select("transport_per_kg, water_penalty_mode, water_penalty_per_kg, default_water_penalty_pct")
      .eq("factory_id", profile.factory_id)
      .maybeSingle(),
  ]);
  if (!rateResource.ok) throw new Error(rateResource.error);
  if (!tierResource.ok) throw new Error(tierResource.error);
  if (settingsError) throw new Error(friendlyError(settingsError));

  const deductionSettings: PaymentSettingsValues = {
    transportPerKg: settings?.transport_per_kg ?? "0",
    waterPenaltyMode: settings?.water_penalty_mode === "per_kg" ? "per_kg" : "percent",
    waterPenaltyPerKg: settings?.water_penalty_per_kg ?? "0",
    defaultWaterPenaltyPct: settings?.default_water_penalty_pct ?? "0",
  };

  return (
    <PaymentSettingsLists
      rates={rateResource.rows}
      tiers={tierResource.rows}
      settings={deductionSettings}
      canManage={MANAGEMENT_ROLES.includes(profile.role)}
      isOwner={profile.role === "owner"}
    />
  );
}
