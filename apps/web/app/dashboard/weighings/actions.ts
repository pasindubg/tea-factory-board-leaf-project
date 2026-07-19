"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { collectorForUser, requirePagePermission } from "@/lib/profile";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";

export async function createWeighing(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("weighings", "create");
  const supplierId = String(formData.get("supplier_id") ?? "");
  const weightKg = Number(String(formData.get("weight_kg") ?? "").trim());
  const collectedAt = String(formData.get("collected_at") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const tierId = String(formData.get("tier_id") ?? "").trim();
  const waterPenalty = formData.get("water_penalty") != null;
  const transportApplies = formData.get("transport_applies") != null;

  let collectorId = String(formData.get("collector_id") ?? "");
  if (profile.role === "collector") {
    const own = await collectorForUser(supabase, profile.id);
    if (!own) return { ok: false, error: "Your login has no linked collector record. Ask the factory owner to link one." };
    collectorId = own.id;
  }
  if (!supplierId || !collectorId || !Number.isFinite(weightKg) || weightKg <= 0) {
    return { ok: false, error: "Supplier, collector and a positive weight are required." };
  }

  const [{ data: supplier }, { data: collector }] = await Promise.all([
    supabase.from("suppliers").select("id").eq("id", supplierId).eq("factory_id", profile.factory_id).eq("active", true).maybeSingle(),
    supabase.from("collectors").select("id").eq("id", collectorId).eq("factory_id", profile.factory_id).neq("active", false).maybeSingle(),
  ]);
  if (!supplier || !collector) return { ok: false, error: "The selected supplier or collector is unavailable." };

  let tierChanged = false;
  if (tierId && MANAGEMENT_ROLES.includes(profile.role)) {
    const { data: tier } = await supabase.from("quality_tiers").select("id").eq("id", tierId).eq("factory_id", profile.factory_id).eq("active", true).maybeSingle();
    if (!tier) return { ok: false, error: "The selected quality tier is unavailable." };
    const { data: existing, error: assignmentError } = await supabase
      .from("supplier_tiers")
      .select("tier_id")
      .eq("supplier_id", supplierId)
      .is("effective_to", null)
      .maybeSingle();
    if (assignmentError) return { ok: false, error: friendlyError(assignmentError) };

    if (!existing || existing.tier_id !== tierId) {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (existing) {
        const { error } = await supabase.from("supplier_tiers").update({ effective_to: yesterday }).eq("supplier_id", supplierId).is("effective_to", null);
        if (error) return { ok: false, error: friendlyError(error) };
      }
      const { error } = await supabase.from("supplier_tiers").insert({
        factory_id: profile.factory_id,
        supplier_id: supplierId,
        tier_id: tierId,
        source: "manual",
        effective_from: today,
        assigned_by: profile.id,
      });
      if (error) return { ok: false, error: friendlyError(error) };
      tierChanged = true;
    }
  }

  const parsedCollectedAt = collectedAt ? new Date(collectedAt) : new Date();
  if (Number.isNaN(parsedCollectedAt.getTime())) return { ok: false, error: "Collected-at time is invalid." };
  const { error } = await supabase.from("weighings").insert({
    id: randomUUID(),
    factory_id: profile.factory_id,
    supplier_id: supplierId,
    collector_id: collectorId,
    weight_kg: weightKg.toFixed(2),
    collected_at: parsedCollectedAt.toISOString(),
    synced_at: new Date().toISOString(),
    water_penalty: waterPenalty,
    transport_applies: transportApplies,
    notes,
  });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath("/dashboard/weighings");
  revalidatePath("/dashboard");
  return {
    ok: true,
    notice: "Weighing recorded.",
    invalidate: tierChanged ? [{ kind: "exact", resource: { key: "payments.tier-assignments" } }] : undefined,
  };
}
