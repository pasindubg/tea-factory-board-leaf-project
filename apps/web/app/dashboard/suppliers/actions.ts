"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { getDefaultRoles } from "@/lib/roles";

function supplierFields(formData: FormData) {
  const landSize = String(formData.get("land_size_acres") ?? "").trim();
  return {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || null,
    nic_number: String(formData.get("nic_number") ?? "").trim() || null,
    area: String(formData.get("area") ?? "").trim() || null,
    land_size_acres: landSize ? landSize : null,
    collector_id: String(formData.get("collector_id") ?? "") || null,
  };
}

export async function createSupplier(formData: FormData) {
  const { supabase, profile } = await requireProfile(getDefaultRoles("suppliers"));
  const fields = supplierFields(formData);
  if (!fields.name) redirect("/dashboard/suppliers/new?error=Name%20is%20required");

  const { error } = await supabase.from("suppliers").insert({ factory_id: profile.factory_id, ...fields });
  if (error) redirect(`/dashboard/suppliers/new?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/dashboard/suppliers");
  redirect("/dashboard/suppliers");
}

export async function updateSupplier(id: string, formData: FormData) {
  const { supabase } = await requireProfile(getDefaultRoles("suppliers"));
  const fields = supplierFields(formData);
  if (!fields.name) redirect(`/dashboard/suppliers/${id}/edit?error=Name%20is%20required`);

  const { error } = await supabase.from("suppliers").update(fields).eq("id", id);
  if (error) redirect(`/dashboard/suppliers/${id}/edit?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/dashboard/suppliers");
  redirect("/dashboard/suppliers");
}

export async function setSupplierActive(id: string, active: boolean) {
  const { supabase } = await requireProfile(getDefaultRoles("suppliers"));
  await supabase.from("suppliers").update({ active }).eq("id", id);
  revalidatePath("/dashboard/suppliers");
}

function selectedIds(formData: FormData) {
  return [...new Set(formData.getAll("selected_ids").map(String).filter(Boolean))];
}

export async function editSelectedSupplier(formData: FormData) {
  const ids = selectedIds(formData);
  if (ids.length !== 1) redirect("/dashboard/suppliers?error=Select%20exactly%20one%20supplier%20to%20edit");
  redirect(`/dashboard/suppliers/${ids[0]}/edit`);
}

export async function setSelectedSuppliersActive(active: boolean, formData: FormData) {
  const { supabase, profile } = await requireProfile(getDefaultRoles("suppliers"));
  const ids = selectedIds(formData);
  if (ids.length === 0) redirect("/dashboard/suppliers?error=Select%20at%20least%20one%20supplier");
  await supabase.from("suppliers").update({ active }).in("id", ids).eq("factory_id", profile.factory_id);
  revalidatePath("/dashboard/suppliers");
}
