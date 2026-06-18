"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { MODULES, type Role } from "@/lib/roles";

export async function saveModulePermissions(formData: FormData) {
  const { supabase, profile } = await requireProfile(["owner"]);

  // Build the upsert payload from the checkbox matrix.
  // Form field names are `perm_{moduleKey}_{role}` (present = checked).
  const rows: { factory_id: string; module_key: string; allowed_roles: string[] }[] = [];

  for (const mod of MODULES) {
    if (mod.key === "overview") continue; // overview is always all-roles, no override needed
    const allowed: Role[] = ["owner"]; // owner always has access — enforce this invariant
    for (const role of mod.roles) {
      if (role === "owner") continue;
      if (formData.get(`perm_${mod.key}_${role}`) === "on") {
        allowed.push(role);
      }
    }
    rows.push({ factory_id: profile.factory_id, module_key: mod.key, allowed_roles: allowed });
  }

  const { error } = await supabase
    .from("module_permissions")
    .upsert(rows, { onConflict: "factory_id,module_key" });

  if (error) {
    redirect(`/dashboard/users/permissions?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/users/permissions");
  revalidatePath("/dashboard");
  redirect("/dashboard/users/permissions?notice=Permissions+saved.");
}
