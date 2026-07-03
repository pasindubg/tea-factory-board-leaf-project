import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MANAGEMENT_ROLES, getDefaultRoles, roleHome, type Role } from "@/lib/roles";

export type Profile = {
  id: string;
  name: string;
  role: Role;
  factory_id: string;
  active: boolean | null;
};

/**
 * Shared auth resolution used by both gates below.
 *
 * - unauthenticated → /login
 * - no profile row (orphaned auth user) → signed out, /login
 * - deactivated → signed out, /login
 */
async function resolveProfile() {
  const supabase = await createClient();

  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    // "Auth session missing" simply means logged out — fall through to the
    // /login redirect below instead of surfacing a scary error page.
    if (error && error.name !== "AuthSessionMissingError") throw error;
    user = data.user;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("fetch failed") || msg.includes("network") || msg.includes("ECONNREFUSED")) {
      throw new Error(`fetch failed: ${msg}`);
    }
    throw new Error("Could not verify your session right now — please retry.");
  }
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("users")
    .select("id, name, role, factory_id, active")
    .eq("id", user.id)
    .single();
  if (!data) {
    await supabase.auth.signOut();
    redirect("/login?error=no_profile");
  }
  const profile = data as Profile;
  if (profile.active === false) {
    await supabase.auth.signOut();
    redirect("/login?error=deactivated");
  }

  return { supabase, profile };
}

/**
 * Resolves the signed-in user's profile and gates by a static role list.
 * Role not allowed here → redirected to their home module.
 */
export async function requireProfile(allowed: readonly Role[] = MANAGEMENT_ROLES) {
  const { supabase, profile } = await resolveProfile();
  if (!allowed.includes(profile.role)) redirect(roleHome(profile.role));
  return { supabase, profile };
}

/**
 * Like requireProfile but checks the per-factory module_permissions table
 * for dynamic access overrides. Owner always passes. Falls back to the
 * hardcoded defaults in MODULES when no override row exists.
 */
export async function requireModuleAccess(moduleKey: string) {
  const { supabase, profile } = await resolveProfile();

  // Owner always has full access — no need to check overrides.
  if (profile.role !== "owner") {
    const { data: override } = await supabase
      .from("module_permissions")
      .select("allowed_roles")
      .eq("module_key", moduleKey)
      .maybeSingle();

    const allowed: string[] = override?.allowed_roles ?? [...getDefaultRoles(moduleKey)];
    if (!allowed.includes(profile.role)) redirect(roleHome(profile.role));
  }

  return { supabase, profile };
}

/**
 * The collector record linked to this user (weighings attribute to it).
 */
export async function collectorForUser(
  supabase: Awaited<ReturnType<typeof requireProfile>>["supabase"],
  userId: string,
) {
  const { data } = await supabase
    .from("collectors")
    .select("id, name, area")
    .eq("user_id", userId)
    .maybeSingle();
  return data as { id: string; name: string; area: string | null } | null;
}
