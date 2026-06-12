"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";

export async function createWeighing(formData: FormData) {
  const { supabase, profile } = await requireProfile();

  const supplierId = String(formData.get("supplier_id") ?? "");
  const collectorId = String(formData.get("collector_id") ?? "");
  const weightKg = String(formData.get("weight_kg") ?? "").trim();
  const collectedAt = String(formData.get("collected_at") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!supplierId || !collectorId || !weightKg || Number(weightKg) <= 0) {
    redirect("/dashboard/weighings/new?error=Supplier%2C%20collector%20and%20a%20positive%20weight%20are%20required");
  }

  const { error } = await supabase.from("weighings").insert({
    id: randomUUID(),
    factory_id: profile.factory_id,
    supplier_id: supplierId,
    collector_id: collectorId,
    weight_kg: weightKg,
    collected_at: collectedAt ? new Date(collectedAt).toISOString() : new Date().toISOString(),
    synced_at: new Date().toISOString(), // entered directly on the server — already "synced"
    notes,
  });
  if (error) redirect(`/dashboard/weighings/new?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/dashboard/weighings");
  revalidatePath("/dashboard");
  redirect("/dashboard/weighings");
}
