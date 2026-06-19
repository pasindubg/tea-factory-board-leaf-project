"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { getDefaultRoles } from "@/lib/roles";

function collectorFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || null,
    nic_number: String(formData.get("nic_number") ?? "").trim() || null,
    area: String(formData.get("area") ?? "").trim() || null,
  };
}

export async function createCollector(formData: FormData) {
  const { supabase, profile } = await requireProfile(getDefaultRoles("collectors"));
  const fields = collectorFields(formData);
  if (!fields.name) redirect("/dashboard/collectors/new?error=Name%20is%20required");

  const { error } = await supabase.from("collectors").insert({ factory_id: profile.factory_id, ...fields });
  if (error) redirect(`/dashboard/collectors/new?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/dashboard/collectors");
  redirect("/dashboard/collectors");
}

export async function updateCollector(id: string, formData: FormData) {
  const { supabase } = await requireProfile(getDefaultRoles("collectors"));
  const fields = collectorFields(formData);
  if (!fields.name) redirect(`/dashboard/collectors/${id}/edit?error=Name%20is%20required`);

  const { error } = await supabase.from("collectors").update(fields).eq("id", id);
  if (error) redirect(`/dashboard/collectors/${id}/edit?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/dashboard/collectors");
  redirect("/dashboard/collectors");
}

export async function setCollectorActive(id: string, active: boolean) {
  const { supabase } = await requireProfile(getDefaultRoles("collectors"));
  await supabase.from("collectors").update({ active }).eq("id", id);
  revalidatePath("/dashboard/collectors");
}
