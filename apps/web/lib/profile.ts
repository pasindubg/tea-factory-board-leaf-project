import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import { withTenantDataScope } from "@/lib/tenant-data";
import {
  MANAGEMENT_ROLES,
  getDefaultRoles,
  getPageDefinition,
  pagesForModule,
  roleHome,
  roleMayPerformPageAction,
  type Role,
  type RolePageAction,
} from "@/lib/roles";

export type Profile = {
  id: string;
  name: string;
  role: Role;
  factory_id: string;
  active: boolean | null;
  access_role_id: string | null;
  access_role_name: string | null;
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
      redirect("/login?error=session_refresh_failed");
    }
    throw new Error("Could not verify your session right now — please retry.");
  }
  if (!user) redirect("/login");

  const { data, error: profileError } = await supabase
    .from("users")
    .select("id, name, role, factory_id, active, access_role_id")
    .eq("id", user.id)
    .single();
  if (profileError && profileError.code !== "PGRST116") {
    throw new Error(`Could not load your factory profile. ${friendlyError(profileError)}`);
  }
  if (!data) {
    await supabase.auth.signOut();
    redirect("/login?error=no_profile");
  }
  const { data: personalProfile, error: personalProfileError } = await supabase
    .from("user_profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (personalProfileError) {
    throw new Error(`Could not load your personal profile. ${friendlyError(personalProfileError)}`);
  }
  let accessRoleName: string | null = null;
  if (data.access_role_id) {
    const { data: accessRole, error: accessRoleError } = await supabase
      .from("access_roles")
      .select("name")
      .eq("id", data.access_role_id)
      .maybeSingle();
    if (accessRoleError) {
      throw new Error(`Could not load your access role. ${friendlyError(accessRoleError)}`);
    }
    accessRoleName = accessRole?.name ?? null;
  }
  const profile: Profile = {
    ...(data as Profile),
    name: String(personalProfile?.full_name ?? data.name).trim() || data.name,
    access_role_name: accessRoleName,
  };
  if (profile.active === false) {
    await supabase.auth.signOut();
    redirect("/login?error=deactivated");
  }

  return {
    supabase: withTenantDataScope(supabase, {
      factoryId: profile.factory_id,
      actorUserId: profile.id,
    }),
    profile,
  };
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
  const pageKey = pagesForModule(moduleKey)[0]?.key;
  if (pageKey) return requirePageAccess(pageKey);

  const { supabase, profile } = await resolveProfile();

  // Owner always has full access — no need to check overrides.
  if (profile.role !== "owner") {
    const { data: override, error: permissionError } = await supabase
      .from("module_permissions")
      .select("allowed_roles")
      .eq("module_key", moduleKey)
      .maybeSingle();
    // Permission lookup failures must fail closed. Falling back to defaults on
    // a database error could grant access that this factory explicitly revoked.
    if (permissionError) {
      throw new Error(`Could not verify module permission. ${friendlyError(permissionError)}`);
    }

    const allowed: string[] = override?.allowed_roles ?? [...getDefaultRoles(moduleKey)];
    if (!allowed.includes(profile.role)) redirect(roleHome(profile.role));
  }

  return { supabase, profile };
}

type ExplicitPagePermission = {
  can_view: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
} | null;

async function explicitPagePermission(
  supabase: Awaited<ReturnType<typeof resolveProfile>>["supabase"],
  profile: Profile,
  pageKey: string,
): Promise<ExplicitPagePermission> {
  if (!profile.access_role_id) return null;
  const { data, error } = await supabase
    .from("role_page_permissions")
    .select("can_view, can_create, can_update, can_delete")
    .eq("role_id", profile.access_role_id)
    .eq("page_key", pageKey)
    .maybeSingle();
  if (error) throw new Error(`Could not verify page permission. ${friendlyError(error)}`);
  return data as ExplicitPagePermission;
}

async function fallbackModuleAccess(
  supabase: Awaited<ReturnType<typeof resolveProfile>>["supabase"],
  profile: Profile,
  pageKey: string,
) {
  const page = getPageDefinition(pageKey);
  if (!page) return false;
  if (!page.roles.includes(profile.role)) return false;
  if (page.moduleKey === "personal-settings") return true;

  const { data: override, error } = await supabase
    .from("module_permissions")
    .select("allowed_roles")
    .eq("module_key", page.moduleKey)
    .maybeSingle();
  if (error) throw new Error(`Could not verify module permission. ${friendlyError(error)}`);
  const allowed = override?.allowed_roles ?? [...getDefaultRoles(page.moduleKey)];
  return allowed.includes(profile.role);
}

async function permittedHome(
  supabase: Awaited<ReturnType<typeof resolveProfile>>["supabase"],
  profile: Profile,
) {
  if (profile.access_role_id) {
    const { data, error } = await supabase
      .from("role_page_permissions")
      .select("page_key")
      .eq("role_id", profile.access_role_id)
      .eq("can_view", true);
    if (error) throw new Error(`Could not resolve your permitted home page. ${friendlyError(error)}`);
    const firstPage = (data ?? [])
      .map((row) => getPageDefinition(row.page_key as string))
      .find((page): page is NonNullable<typeof page> => Boolean(page && !page.href.includes("[")));
    if (firstPage) return firstPage.href;
  }
  return roleHome(profile.role);
}

/** Gates a concrete dashboard page. Custom-role rows are fail-closed. */
export async function requirePageAccess(pageKey: string) {
  const { supabase, profile } = await resolveProfile();
  const page = getPageDefinition(pageKey);
  if (!page) throw new Error(`Unknown page permission key: ${pageKey}`);
  if (profile.role === "owner") return { supabase, profile };

  const explicit = await explicitPagePermission(supabase, profile, pageKey);
  const allowed = explicit ? explicit.can_view : await fallbackModuleAccess(supabase, profile, pageKey);
  if (!allowed) redirect(await permittedHome(supabase, profile));
  return { supabase, profile };
}

/**
 * Enforces an explicit custom-role CRUD setting in addition to page access.
 * The static base role remains a hard upper boundary so permissions cannot
 * elevate an account beyond the project's RLS policies.
 */
export async function requirePagePermission(pageKey: string, action: RolePageAction) {
  const { supabase, profile } = await requirePageAccess(pageKey);
  if (profile.role === "owner") return { supabase, profile };
  const page = getPageDefinition(pageKey);
  if (!page || !roleMayPerformPageAction(profile.role, page, action)) redirect(await permittedHome(supabase, profile));

  const explicit = await explicitPagePermission(supabase, profile, pageKey);
  if (explicit) {
    const allowed = action === "view"
      ? explicit.can_view
      : action === "create"
        ? explicit.can_create
        : action === "update"
          ? explicit.can_update
          : explicit.can_delete;
    if (!allowed) redirect(await permittedHome(supabase, profile));
  }
  return { supabase, profile };
}

/**
 * Applies the factory's dynamic module permission first, then narrows a
 * specific command to its allowed roles. Use this for mutations in modules
 * that are readable by a wider audience (for example accountant read-only).
 */
export async function requireModuleRole(moduleKey: string, allowedRoles: readonly Role[]) {
  const { supabase, profile } = await requireModuleAccess(moduleKey);
  if (!allowedRoles.includes(profile.role)) redirect(roleHome(profile.role));
  return { supabase, profile };
}

/**
 * The collector record linked to this user (weighings attribute to it).
 */
export async function collectorForUser(
  supabase: Awaited<ReturnType<typeof requireProfile>>["supabase"],
  userId: string,
) {
  const { data, error } = await supabase
    .from("collectors")
    .select("id, name, area")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not resolve the collector profile. ${friendlyError(error)}`);
  return data as { id: string; name: string; area: string | null } | null;
}
