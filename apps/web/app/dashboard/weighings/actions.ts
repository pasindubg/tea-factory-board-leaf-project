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
