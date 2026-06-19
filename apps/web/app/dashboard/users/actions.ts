"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { type Role } from "@/lib/roles";

// Tenant data writes go through the session client so RLS keeps enforcing
// factory isolation. The admin client is used ONLY for auth-side ops
// (create login, set password, ban, delete login).

const ALL_ROLES: Role[] = ["owner", "manager", "supervisor", "accountant", "collector"];
// Roles that managers are allowed to create/manage (they cannot touch owners).
const MANAGER_CREATABLE_ROLES: Role[] = ["manager", "supervisor", "accountant", "collector"];

export async function createUser(formData: FormData) {
  const { supabase, profile } = await requireProfile(["owner"]);

  const name     = String(formData.get("name")     ?? "").trim();
  const email    = String(formData.get("email")    ?? "").trim().toLowerCase();
  const phone    = String(formData.get("phone")    ?? "").trim() || null;
  const role     = String(formData.get("role")     ?? "") as Role;
  const username = String(formData.get("username") ?? "").trim().toLowerCase() || null;
  const password = String(formData.get("password") ?? "").trim() || null;

  if (!name || !email || !ALL_ROLES.includes(role)) {
    redirect("/dashboard/users/new?error=Name%2C%20email%20and%20a%20valid%20role%20are%20required");
  }
  // Managers cannot create owner accounts.
  if (profile.role === "manager" && !MANAGER_CREATABLE_ROLES.includes(role)) {
    redirect("/dashboard/users/new?error=Managers%20cannot%20create%20owner%20accounts.");
  }
  // Username requires a password and vice-versa.
  if ((username && !password) || (!username && password)) {
    redirect("/dashboard/users/new?error=Provide%20both%20a%20username%20and%20a%20password%2C%20or%20neither.");
  }

  const admin = createAdminClient();
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(password ? { password } : {}),
  });
  if (authErr || !created.user) {
    const msg =
      authErr?.code === "email_exists"
        ? "An account with this email already exists."
        : (authErr?.message ?? "Could not create the login.");
    redirect(`/dashboard/users/new?error=${encodeURIComponent(msg)}`);
  }
  const authId = created.user.id;

  const { error: insErr } = await supabase.from("users").insert({
    id: authId,
    factory_id: profile.factory_id,
    name,
    email,
    phone,
    role,
    username,
  });
  if (insErr) {
    await admin.auth.admin.deleteUser(authId);
    const msg =
      insErr.code === "23505" && insErr.message.includes("users_username_key")
        ? "That username is already taken."
        : insErr.message;
    redirect(`/dashboard/users/new?error=${encodeURIComponent(msg)}`);
  }

  if (role === "collector") {
    const { error: colErr } = await supabase.from("collectors").insert({
      factory_id: profile.factory_id,
      user_id: authId,
      name,
      phone,
    });
    if (colErr) {
      redirect(
        `/dashboard/users?notice=${encodeURIComponent(
          `User created, but their collector record failed (${colErr.message}). Create and link one on the Collectors page.`,
        )}`,
      );
    }
  }

  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard/collectors");
  redirect(`/dashboard/users?notice=${encodeURIComponent(`${name} can now sign in with ${email}.`)}`);
}

export async function setUserActive(formData: FormData) {
  const { supabase, profile } = await requireProfile(["owner"]);

  const userId     = String(formData.get("user_id")     ?? "");
  const nextActive = String(formData.get("next_active") ?? "") === "true";
  if (!userId) redirect("/dashboard/users?error=Missing%20user");
  if (userId === profile.id) {
    redirect("/dashboard/users?error=You%20can%27t%20change%20your%20own%20account.");
  }

  // Managers cannot deactivate owners.
  if (profile.role === "manager") {
    const { data: target } = await supabase.from("users").select("role").eq("id", userId).single();
    if (target?.role === "owner") {
      redirect("/dashboard/users?error=Managers%20cannot%20deactivate%20owner%20accounts.");
    }
  }

  const { data: updated, error } = await supabase
    .from("users")
    .update({ active: nextActive })
    .eq("id", userId)
    .select("id, name")
    .single();
  if (error || !updated) {
    redirect(`/dashboard/users?error=${encodeURIComponent(error?.message ?? "User not found.")}`);
  }

  const admin = createAdminClient();
  const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: nextActive ? "none" : "87600h",
  });
  if (banErr) {
    redirect(
      `/dashboard/users?notice=${encodeURIComponent(
        `${updated.name} ${nextActive ? "reactivated" : "deactivated"} in the app, but the login ban failed: ${banErr.message}`,
      )}`,
    );
  }

  revalidatePath("/dashboard/users");
  redirect(
    `/dashboard/users?notice=${encodeURIComponent(`${updated.name} ${nextActive ? "reactivated" : "deactivated"}.`)}`,
  );
}

export async function removeUser(formData: FormData) {
  const { supabase, profile } = await requireProfile(["owner"]);

  const userId = String(formData.get("user_id") ?? "");
  if (!userId) redirect("/dashboard/users?error=Missing%20user");
  if (userId === profile.id) {
    redirect("/dashboard/users?error=You%20can%27t%20remove%20your%20own%20account.");
  }

  const { data: target } = await supabase.from("users").select("id, name, role").eq("id", userId).single();
  if (!target) redirect("/dashboard/users?error=User%20not%20found.");

  // Managers cannot remove owners.
  if (profile.role === "manager" && target.role === "owner") {
    redirect("/dashboard/users?error=Managers%20cannot%20remove%20owner%20accounts.");
  }

  const admin = createAdminClient();
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr && authErr.code !== "user_not_found") {
    redirect(`/dashboard/users?error=${encodeURIComponent(`Could not delete the login: ${authErr.message}`)}`);
  }

  await supabase.from("collectors").update({ user_id: null }).eq("user_id", userId);

  const { error: delErr } = await supabase.from("users").delete().eq("id", userId);
  if (delErr) {
    redirect(`/dashboard/users?error=${encodeURIComponent(delErr.message)}`);
  }

  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard/collectors");
  redirect(`/dashboard/users?notice=${encodeURIComponent(`${target.name} removed. Their records were kept.`)}`);
}

export async function resetUserPassword(formData: FormData) {
  const { supabase, profile } = await requireProfile(["owner"]);

  const userId   = String(formData.get("user_id")  ?? "");
  const username = String(formData.get("username") ?? "").trim().toLowerCase() || null;
  const password = String(formData.get("password") ?? "").trim() || null;

  if (!userId) redirect("/dashboard/users?error=Missing%20user");
  if ((username && !password) || (!username && password)) {
    redirect("/dashboard/users?error=Provide%20both%20a%20username%20and%20a%20password%2C%20or%20neither.");
  }

  // Managers cannot reset owner passwords.
  if (profile.role === "manager") {
    const { data: t } = await supabase.from("users").select("role").eq("id", userId).single();
    if (t?.role === "owner") {
      redirect("/dashboard/users?error=Managers%20cannot%20reset%20owner%20credentials.");
    }
  }

  const { data: updated, error: profErr } = await supabase
    .from("users")
    .update({ username })
    .eq("id", userId)
    .select("id, name")
    .single();
  if (profErr || !updated) {
    const msg =
      profErr?.code === "23505" && profErr.message.includes("users_username_key")
        ? "That username is already taken."
        : (profErr?.message ?? "User not found.");
    redirect(`/dashboard/users?error=${encodeURIComponent(msg)}`);
  }

  if (password) {
    const admin = createAdminClient();
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
    if (pwErr) {
      redirect(
        `/dashboard/users?error=${encodeURIComponent(`Username saved but password update failed: ${pwErr.message}`)}`,
      );
    }
  }

  revalidatePath("/dashboard/users");
  redirect(`/dashboard/users?notice=${encodeURIComponent(`Credentials updated for ${updated.name}.`)}`);
}
