import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MANAGEMENT_ROLES, roleHome, type Role } from "@/lib/roles";

export type Profile = {
  id: string;
  name: string;
  role: Role;
  factory_id: string;
  active: boolean | null;
};

/**
 * Resolves the signed-in user's profile and gates by role.
 *
 * - unauthenticated → /login
 * - no profile row (orphaned auth user) → signed out, /login
 * - deactivated → signed out, /login (auth-level ban is applied on deactivate,
 *   but bans don't kill already-issued access tokens — this check does)
 * - authenticated but role not allowed here → redirected to their home module
 *
 * Defaults to management roles so data-management pages stay protected;
 * pages that admit collectors pass an explicit allow-list.
 */
export async function requireProfile(allowed: readonly Role[] = MANAGEMENT_ROLES) {
  const supabase = await createClient();

  // getUser() calls the Supabase auth server; on a flaky network it can throw
  // or return an error. Treat that as retryable (throw) rather than redirecting
  // to /login, which would drop a valid session on a transient blip. Only a
  // clean "no user, no error" result means the visitor is genuinely signed out.
  let user;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    user = data.user;
  } catch {
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
  if (!allowed.includes(profile.role)) redirect(roleHome(profile.role));

  return { supabase, profile };
}

/**
 * The collector record linked to this user (weighings attribute to it).
 * Null for users without one (e.g. owners, or a collector login whose record
 * was never linked).
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
