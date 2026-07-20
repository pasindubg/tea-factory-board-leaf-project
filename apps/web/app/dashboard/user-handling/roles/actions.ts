"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { requireProfile } from "@/lib/profile";
import {
  CUSTOMIZABLE_BASE_ROLES,
  PAGE_DEFINITIONS,
  roleMayPerformPageAction,
  type Role,
} from "@/lib/roles";
import { deleteTenantRow } from "@/lib/tenant-data";

const ROLES_PATH = "/dashboard/user-handling/roles";

function roleKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function createAccessRole(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const name = String(formData.get("name") ?? "").trim();
  const baseRole = String(formData.get("base_role") ?? "") as Role;
  const key = roleKey(name);
  if (!name || !key || !CUSTOMIZABLE_BASE_ROLES.includes(baseRole)) {
    return { ok: false, error: "Enter a role name and choose a valid base security level." };
  }

  const { data: role, error } = await supabase
    .from("access_roles")
    .insert({ factory_id: profile.factory_id, key, name, base_role: baseRole })
    .select("id")
    .single();
  if (error || !role) {
    return { ok: false, error: error?.code === "23505" ? "A role with this name already exists." : friendlyError(error) };
  }

  // Every page receives an explicit deny row. The owner selects the allowed
  // pages/actions next; a custom role therefore starts with no access.
  const { error: permissionError } = await supabase.from("role_page_permissions").insert(
    PAGE_DEFINITIONS.map((page) => ({
      factory_id: profile.factory_id,
      role_id: role.id,
      page_key: page.key,
      can_view: false,
      can_create: false,
      can_update: false,
      can_delete: false,
    })),
  );
  if (permissionError) {
    await deleteTenantRow(supabase, "access_roles", role.id);
    return { ok: false, error: friendlyError(permissionError) };
  }

  revalidatePath(ROLES_PATH);
  return { ok: true, notice: `${name} created. Configure its page access next.` };
}

export async function renameAccessRole(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase } = await requireProfile(["owner"]);
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { ok: false, error: "Role name is required." };
  const { data, error } = await supabase
    .from("access_roles")
    .update({ name })
    .eq("id", id)
    .eq("system_role", false)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.code === "23505" ? "A role with this name already exists." : friendlyError(error) };
  if (!data) return { ok: false, error: "Built-in roles cannot be renamed." };
  revalidatePath(ROLES_PATH);
  return { ok: true, notice: "Role renamed." };
}

export async function removeAccessRole(formData: FormData): Promise<ListMutationResult> {
  const { supabase } = await requireProfile(["owner"]);
  const id = String(formData.get("role_id") ?? "");
  if (!id) return { ok: false, error: "Choose a role first." };
  const { data: role, error } = await supabase
    .from("access_roles")
    .select("id, name, system_role")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!role) return { ok: false, error: "Role not found." };
  if (role.system_role) return { ok: false, error: "Built-in roles are retained for existing accounts and cannot be removed." };
  const { error: deleteError } = await deleteTenantRow(supabase, "access_roles", id);
  if (deleteError) return { ok: false, error: deleteError };
  revalidatePath(ROLES_PATH);
  revalidatePath("/dashboard/user-handling/users");
  return { ok: true, notice: `${role.name} removed. Users assigned to it now use their base role.` };
}

export async function saveRolePagePermissions(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const roleId = String(formData.get("role_id") ?? "");
  if (!roleId) return { ok: false, error: "Role not found." };
  const { data: role, error: roleError } = await supabase
    .from("access_roles")
    .select("id, base_role, name")
    .eq("id", roleId)
    .maybeSingle();
  if (roleError) return { ok: false, error: friendlyError(roleError) };
  if (!role) return { ok: false, error: "Role not found." };

  const rows = PAGE_DEFINITIONS.map((page) => {
    const selected = (action: "view" | "create" | "update" | "delete") =>
      roleMayPerformPageAction(role.base_role as Role, page, action) && formData.get(`perm_${page.key}_${action}`) === "on";
    const canCreate = selected("create");
    const canUpdate = selected("update");
    const canDelete = selected("delete");
    return {
      factory_id: profile.factory_id,
      role_id: role.id,
      page_key: page.key,
      can_view: selected("view") || canCreate || canUpdate || canDelete,
      can_create: canCreate,
      can_update: canUpdate,
      can_delete: canDelete,
    };
  });
  const { error } = await supabase
    .from("role_page_permissions")
    .upsert(rows, { onConflict: "role_id,page_key" });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(ROLES_PATH);
  revalidatePath(`${ROLES_PATH}/${role.id}`);
  revalidatePath("/dashboard");
  return { ok: true, notice: `${role.name} page permissions saved.` };
}
