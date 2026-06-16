"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { collectorForUser, requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES } from "@/lib/roles";

export async function createWeighing(formData: FormData) {
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);

  const supplierId = String(formData.get("supplier_id") ?? "");
  const weightKg = String(formData.get("weight_kg") ?? "").trim();
  const collectedAt = String(formData.get("collected_at") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const tierId = String(formData.get("tier_id") ?? "").trim();
  const waterPenaltyPct = Number(String(formData.get("water_penalty_pct") ?? "").trim() || "0");

  // Collectors always record as themselves; the form's collector field is
  // ignored for them so one collector can't book weighings under another.
  let collectorId = String(formData.get("collector_id") ?? "");
  if (profile.role === "collector") {
    const own = await collectorForUser(supabase, profile.id);
    if (!own) {
      redirect(
        "/dashboard/weighings/new?error=Your%20login%20has%20no%20collector%20record.%20Ask%20the%20factory%20owner%20to%20link%20one.",
      );
    }
    collectorId = own.id;
  }

  if (!supplierId || !collectorId || !weightKg || Number(weightKg) <= 0) {
    redirect("/dashboard/weighings/new?error=Supplier%2C%20collector%20and%20a%20positive%20weight%20are%20required");
  }

  // Update supplier tier if one was selected and it differs from current.
  if (tierId) {
    const { data: existing } = await supabase
      .from("supplier_tiers")
      .select("tier_id")
      .eq("supplier_id", supplierId)
      .is("effective_to", null)
      .maybeSingle();

    if (!existing || existing.tier_id !== tierId) {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (existing) {
        await supabase
          .from("supplier_tiers")
          .update({ effective_to: yesterday })
          .eq("supplier_id", supplierId)
          .is("effective_to", null);
      }
      await supabase.from("supplier_tiers").insert({
        factory_id: profile.factory_id,
        supplier_id: supplierId,
        tier_id: tierId,
        source: "manual",
        effective_from: today,
        assigned_by: profile.id,
      });
    }
  }

  const { error } = await supabase.from("weighings").insert({
    id: randomUUID(),
    factory_id: profile.factory_id,
    supplier_id: supplierId,
    collector_id: collectorId,
    weight_kg: weightKg,
    collected_at: collectedAt ? new Date(collectedAt).toISOString() : new Date().toISOString(),
    synced_at: new Date().toISOString(),
    notes,
  });
  if (error) redirect(`/dashboard/weighings/new?error=${encodeURIComponent(error.message)}`);

  // Auto-create water penalty adjustment if reported at intake.
  if (waterPenaltyPct > 0) {
    const occurredOn = collectedAt
      ? new Date(collectedAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const d = new Date(`${occurredOn}T00:00:00`);
    await supabase.from("supplier_adjustments").insert({
      factory_id: profile.factory_id,
      supplier_id: supplierId,
      kind: "water_penalty",
      label: "Water penalty",
      amount: null,
      percent: waterPenaltyPct.toFixed(2),
      occurred_on: occurredOn,
      period_year: d.getFullYear(),
      period_month: d.getMonth() + 1,
      created_by: profile.id,
    });
  }

  revalidatePath("/dashboard/weighings");
  revalidatePath("/dashboard");
  redirect("/dashboard/weighings");
}
