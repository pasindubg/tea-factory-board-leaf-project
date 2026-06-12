"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/roles";

// Tenant data writes go through the session client so RLS keeps enforcing
// factory isolation even for owners. The admin client is used ONLY for the
// auth-side of a user (create login, ban, delete login).

const VALID_ROLES: Role[] = ["owner", "manager", "collector"];

export async function createUser(formData: FormData) {
  const { supabase, profile } = await requireProfile(["owner"]);

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "") as Role;

  if (!name || !email || !VALID_ROLES.includes(role)) {
    redirect("/dashboard/users/new?error=Name%2C%20email%20and%20a%20valid%20role%20are%20required");
  }

  const admin = createAdminClient();
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
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
  });
  if (insErr) {
    // don't leave an orphaned login behind
    await admin.auth.admin.deleteUser(authId);
    redirect(`/dashboard/users/new?error=${encodeURIComponent(insErr.message)}`);
  }

  // Collector logins need a collectors record for weighing attribution.
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

  const userId = String(formData.get("user_id") ?? "");
  const nextActive = String(formData.get("next_active") ?? "") === "true";
  if (!userId) redirect("/dashboard/users?error=Missing%20user");
  if (userId === profile.id) {
    redirect("/dashboard/users?error=You%20can%27t%20change%20your%20own%20account.");
  }

  // RLS scopes this update to the owner's factory — a foreign id matches no row.
  const { data: updated, error } = await supabase
    .from("users")
    .update({ active: nextActive })
    .eq("id", userId)
    .select("id, name")
    .single();
  if (error || !updated) {
    redirect(`/dashboard/users?error=${encodeURIComponent(error?.message ?? "User not found.")}`);
  }

  // Auth-level: ban stops new sign-ins/refreshes; the app-level active check in
  // requireProfile covers tokens issued before the ban.
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

  // RLS proves the target belongs to this factory before any admin-side delete.
  const { data: target } = await supabase.from("users").select("id, name").eq("id", userId).single();
  if (!target) redirect("/dashboard/users?error=User%20not%20found.");

  // 1. Kill the login first (idempotent: a missing auth user is fine on retry).
  const admin = createAdminClient();
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr && authErr.code !== "user_not_found") {
    redirect(`/dashboard/users?error=${encodeURIComponent(`Could not delete the login: ${authErr.message}`)}`);
  }

  // 2. Unlink (not delete) their collector record — weighings history stays.
  await supabase.from("collectors").update({ user_id: null }).eq("user_id", userId);

  // 3. Drop the profile row.
  const { error: delErr } = await supabase.from("users").delete().eq("id", userId);
  if (delErr) {
    redirect(`/dashboard/users?error=${encodeURIComponent(delErr.message)}`);
  }

  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard/collectors");
  redirect(`/dashboard/users?notice=${encodeURIComponent(`${target.name} removed. Their records were kept.`)}`);
}
