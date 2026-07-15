"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { requireProfile } from "@/lib/profile";
import { MODULES, type Role } from "@/lib/roles";

export async function saveModulePermissions(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const rows: { factory_id: string; module_key: string; allowed_roles: string[] }[] = [];

  for (const moduleDef of MODULES) {
    if (moduleDef.key === "overview") continue;

    // Owner access is invariant. A role can only be removed from a module that
    // already includes that role in its code-level maximum permission set.
    const allowed: Role[] = ["owner"];
    for (const role of moduleDef.roles) {
      if (role !== "owner" && formData.get(`perm_${moduleDef.key}_${role}`) === "on") {
        allowed.push(role);
      }
    }

    rows.push({
      factory_id: profile.factory_id,
      module_key: moduleDef.key,
      allowed_roles: allowed,
    });
  }

  const { error } = await supabase
    .from("module_permissions")
    .upsert(rows, { onConflict: "factory_id,module_key" });

  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath("/dashboard/users/permissions");
  revalidatePath("/dashboard");
  return { ok: true, notice: "Module permissions saved." };
}
