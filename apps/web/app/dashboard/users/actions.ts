"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { ListInvalidation } from "@/lib/list-resources";
import { requireProfile } from "@/lib/profile";
import { type Role } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteTenantRow } from "@/lib/tenant-data";

// Tenant records always use the signed-in, factory-scoped client. The admin
// client is deliberately limited to Supabase Auth operations.
const ALL_ROLES: Role[] = ["owner", "manager", "supervisor", "accountant", "collector"];
const COLLECTORS_INVALIDATION: ListInvalidation = {
  kind: "exact",
  resource: { key: "leaf.collectors" },
};

function requiredUserError() {
  return { ok: false, error: "Choose a user first." } satisfies ListMutationResult;
}

function selfManagementError(action: string) {
  return {
    ok: false,
    error: `You can't ${action} your own account here.`,
  } satisfies ListMutationResult;
}

export async function createUser(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "") as Role;
  const username = String(formData.get("username") ?? "").trim().toLowerCase() || null;
  const password = String(formData.get("password") ?? "").trim() || null;

  if (!name || !email || !ALL_ROLES.includes(role)) {
    return { ok: false, error: "Name, email, and a valid role are required." };
  }
  if ((username && !password) || (!username && password)) {
    return { ok: false, error: "Provide both a username and a password, or neither." };
  }

  const admin = createAdminClient();
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(password ? { password } : {}),
  });
  if (authError || !created.user) {
    return {
      ok: false,
      error: authError?.code === "email_exists"
        ? "An account with this email already exists."
        : friendlyError(authError),
    };
  }

  const authId = created.user.id;
  const { error: insertError } = await supabase.from("users").insert({
    id: authId,
    factory_id: profile.factory_id,
    name,
    email,
    phone,
    role,
    username,
  });
  if (insertError) {
    const { error: rollbackError } = await admin.auth.admin.deleteUser(authId);
    if (rollbackError && rollbackError.code !== "user_not_found") {
      return {
        ok: false,
        error: "Account setup failed, and its temporary login could not be cleaned up. Contact support before retrying.",
      };
    }
    return { ok: false, error: friendlyError(insertError) };
  }

  if (role === "collector") {
    const { error: collectorError } = await supabase.from("collectors").insert({
      factory_id: profile.factory_id,
      user_id: authId,
      name,
      phone,
    });
    if (collectorError) {
      revalidatePath("/dashboard/users");
      return {
        ok: true,
        notice: `User created, but their collector record failed (${friendlyError(collectorError)}). Create and link one on the Collectors page.`,
        invalidate: [COLLECTORS_INVALIDATION],
      };
    }
  }

  revalidatePath("/dashboard/users");
  if (role === "collector") revalidatePath("/dashboard/collectors");
  return {
    ok: true,
    notice: `${name} can now sign in with ${email}.`,
    ...(role === "collector" ? { invalidate: [COLLECTORS_INVALIDATION] } : {}),
  };
}

export async function setUserActive(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);

  const userId = String(formData.get("user_id") ?? "");
  const nextActive = String(formData.get("next_active") ?? "") === "true";
  if (!userId) return requiredUserError();
  if (userId === profile.id) return selfManagementError("change");

  const { data: updated, error } = await supabase
    .from("users")
    .update({ active: nextActive })
    .eq("id", userId)
    .eq("factory_id", profile.factory_id)
    .select("id, name")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!updated) return { ok: false, error: "User not found in this factory." };

  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: nextActive ? "none" : "87600h",
  });

  revalidatePath("/dashboard/users");
  if (banError) {
    return {
      ok: true,
      notice: `${updated.name} was ${nextActive ? "reactivated" : "deactivated"} in the app, but the login update failed: ${friendlyError(banError)}`,
    };
  }

  return {
    ok: true,
    notice: `${updated.name} ${nextActive ? "reactivated" : "deactivated"}.`,
  };
}

export async function removeUser(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);

  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return requiredUserError();
  if (userId === profile.id) return selfManagementError("remove");

  const { data: target, error: targetError } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("id", userId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (targetError) return { ok: false, error: friendlyError(targetError) };
  if (!target) return { ok: false, error: "User not found in this factory." };

  // PostgreSQL owns dependent-row behavior. Nullable actor/collector links use
  // ON DELETE SET NULL, while restrictive relationships return a friendly
  // dependent-record error from the shared tenant delete helper.
  const { error: deleteError } = await deleteTenantRow(supabase, "users", userId);
  if (deleteError) return { ok: false, error: deleteError };

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  const invalidateCollectors = target.role === "collector";

  revalidatePath("/dashboard/users");
  if (invalidateCollectors) revalidatePath("/dashboard/collectors");

  if (authError && authError.code !== "user_not_found") {
    return {
      ok: true,
      notice: `The user profile was removed, but the login could not be deleted: ${friendlyError(authError)}`,
      ...(invalidateCollectors ? { invalidate: [COLLECTORS_INVALIDATION] } : {}),
    };
  }

  return {
    ok: true,
    notice: `${target.name} removed. Their historical records were kept.`,
    ...(invalidateCollectors ? { invalidate: [COLLECTORS_INVALIDATION] } : {}),
  };
}

export async function resetUserPassword(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);

  const userId = String(formData.get("user_id") ?? "");
  const username = String(formData.get("username") ?? "").trim().toLowerCase() || null;
  const password = String(formData.get("password") ?? "").trim() || null;

  if (!userId) return requiredUserError();
  if (userId === profile.id) return selfManagementError("change credentials for");
  if ((username && !password) || (!username && password)) {
    return { ok: false, error: "Provide both a username and a password, or neither." };
  }

  const { data: updated, error: profileError } = await supabase
    .from("users")
    .update({ username })
    .eq("id", userId)
    .eq("factory_id", profile.factory_id)
    .select("id, name")
    .maybeSingle();
  if (profileError) return { ok: false, error: friendlyError(profileError) };
  if (!updated) return { ok: false, error: "User not found in this factory." };

  if (password) {
    const admin = createAdminClient();
    const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password });
    if (passwordError) {
      revalidatePath("/dashboard/users");
      return {
        ok: true,
        notice: `The username was saved, but the password update failed: ${friendlyError(passwordError)}`,
      };
    }
  }

  revalidatePath("/dashboard/users");
  return { ok: true, notice: `Credentials updated for ${updated.name}.` };
}
