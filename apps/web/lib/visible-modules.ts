import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { MODULES, pagesForModule, type ModuleDef, type Role } from "@/lib/roles";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Profile = { role: string; access_role_id: string | null };

/**
 * The navigation destinations a signed-in user may reach.
 *
 * Owner sees everything; others respect module overrides → base-role defaults.
 * The module's base `roles` list is a hard ceiling a custom role's explicit
 * page-permission rows can only narrow, never widen — otherwise a role that
 * used to be allowed (before a module's base roles were tightened) keeps
 * seeing it forever via its stale `can_view: true` row.
 *
 * A custom role (access_role_id set) always has an explicit row per page that
 * existed when it was created. A missing row means the page was added later,
 * which must default to "not yet granted" — never a fallback to the base
 * role's default access — or every existing custom role silently inherits full
 * access to any brand-new page the moment it ships.
 *
 * The sidebar and the section grids both read this. Keeping one implementation
 * is the point: a section grid that computed its own answer advertised pages
 * the sidebar had correctly hidden.
 */
export async function visibleModules(supabase: Supabase, profile: Profile): Promise<ModuleDef[]> {
  const [{ data: overrides }, { data: pagePermissions }] = await Promise.all([
    supabase.from("module_permissions").select("module_key, allowed_roles"),
    profile.access_role_id
      ? supabase.from("role_page_permissions").select("page_key, can_view").eq("role_id", profile.access_role_id)
      : Promise.resolve({ data: [] }),
  ]);

  const overrideMap = Object.fromEntries(
    (overrides ?? []).map((row) => [row.module_key, row.allowed_roles as string[]]),
  );
  const pagePermissionMap = new Map(
    (pagePermissions ?? []).map((row) => [row.page_key as string, Boolean(row.can_view)]),
  );

  return MODULES.filter((mod) => {
    if (mod.visibleInNavigation === false) return false;
    if (profile.role === "owner") return true;
    if (!mod.roles.includes(profile.role as Role)) return false;
    const pageKey = pagesForModule(mod.key)[0]?.key;
    if (profile.access_role_id) return pageKey ? pagePermissionMap.get(pageKey) === true : false;
    const allowed: string[] = overrideMap[mod.key] ?? [...mod.roles];
    return allowed.includes(profile.role as Role);
  });
}
