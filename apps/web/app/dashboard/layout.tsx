import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES, MODULES, ROLE_LABELS, pagesForModule, type Role } from "@/lib/roles";
import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);

  const { data: factory } = await supabase
    .from("factories")
    .select("name, logo_path")
    .eq("id", profile.factory_id)
    .single();
  const factoryName = factory?.name ?? "Unknown factory";
  const { data: signedLogo } = factory?.logo_path
    ? await supabase.storage.from("factory-branding").createSignedUrl(factory.logo_path, 60 * 60 * 24)
    : { data: null };

  // Existing module overrides remain the fallback for the migrated system
  // roles. A configured role-page row takes precedence for custom roles.
  const [{ data: overrides }, { data: pagePermissions }] = await Promise.all([
    supabase.from("module_permissions").select("module_key, allowed_roles"),
    profile.access_role_id
      ? supabase.from("role_page_permissions").select("page_key, can_view").eq("role_id", profile.access_role_id)
      : Promise.resolve({ data: [] }),
  ]);

  const overrideMap = Object.fromEntries(
    (overrides ?? []).map((r) => [r.module_key, r.allowed_roles as string[]]),
  );
  const pagePermissionMap = new Map((pagePermissions ?? []).map((row) => [row.page_key as string, Boolean(row.can_view)]));

  // Owner always sees everything; others respect overrides → defaults. The
  // module's base `roles` list is a hard ceiling a custom role's explicit
  // page-permission rows can only narrow, never widen — otherwise a role
  // that used to be allowed (before a module's base roles were tightened)
  // keeps seeing it forever via its stale `can_view: true` row.
  //
  // A custom role (profile.access_role_id set) always has an explicit row
  // per page that existed when it was created. A missing row means the page
  // was added later, which must default to "not yet granted" — never a
  // fallback to the base role's default access — or every existing custom
  // role silently inherits full access to any brand-new page the moment it
  // ships.
  const nav = MODULES.filter((mod) => {
    if (mod.visibleInNavigation === false) return false;
    if (profile.role === "owner") return true;
    if (!mod.roles.includes(profile.role as Role)) return false;
    const pageKey = pagesForModule(mod.key)[0]?.key;
    if (profile.access_role_id) return pageKey ? pagePermissionMap.get(pageKey) === true : false;
    const allowed: string[] = overrideMap[mod.key] ?? [...mod.roles];
    return allowed.includes(profile.role as Role);
  });
  const wantsDispatchDetail = nav.some((mod) => mod.key === "auction-dispatch-detail");
  // Undated dispatches exist, and Postgres sorts NULLs first on DESC.
  const { data: latestDispatchRows } = wantsDispatchDetail
    ? await supabase
        .from("auction_sales")
        .select("id")
        .eq("sale_kind", "dispatch")
        .order("dispatch_date", { ascending: false, nullsFirst: false })
        .order("sale_no", { ascending: false, nullsFirst: false })
        .limit(1)
    : { data: [] };
  const latestDispatch = latestDispatchRows?.[0];
  const navWithDetailLinks = nav.flatMap((mod) => {
    if (mod.key === "auction-dispatch-detail" && latestDispatch?.id) {
      return [{ ...mod, href: `/dashboard/auction/${latestDispatch.id}` }];
    }
    // auction-sale-detail needs nothing here: its href is a stable page
    // (/dashboard/auction/sales-details) that picks the sale to open itself.
    return [mod];
  });

  return (
    <DashboardShell
      factoryName={factoryName}
      factoryLogoUrl={signedLogo?.signedUrl ?? null}
      profileName={profile.name}
      profileRole={profile.access_role_name ?? ROLE_LABELS[profile.role]}
      nav={navWithDetailLinks}
    >
      {children}
    </DashboardShell>
  );
}
