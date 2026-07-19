import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES, MODULES, ROLE_LABELS, pagesForModule, type Role } from "@/lib/roles";
import { DashboardShell } from "./dashboard-shell";
import { saleNoKey } from "./auction/sale-number";

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

  // Owner always sees everything; others respect overrides → defaults.
  const nav = MODULES.filter((mod) => {
    if (profile.role === "owner") return true;
    const pageKey = pagesForModule(mod.key)[0]?.key;
    if (pageKey && pagePermissionMap.has(pageKey)) return pagePermissionMap.get(pageKey) === true;
    const allowed: string[] = overrideMap[mod.key] ?? [...mod.roles];
    return allowed.includes(profile.role as Role);
  });
  const wantsDispatchDetail = nav.some((mod) => mod.key === "auction-dispatch-detail");
  const wantsSaleDetail = nav.some((mod) => mod.key === "auction-sale-detail");
  const [{ data: latestDispatchRows }, { data: latestSaleRows }] = await Promise.all([
    wantsDispatchDetail
      ? supabase
          .from("auction_sales")
          .select("id")
          .order("dispatch_date", { ascending: false })
          .order("sale_no", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] }),
    wantsSaleDetail
      ? supabase
          .from("auction_sales")
          .select("sale_no, target_sale_no")
          .not("target_sale_no", "is", null)
          .order("dispatch_date", { ascending: false })
          .order("target_sale_no", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] }),
  ]);
  const latestDispatch = latestDispatchRows?.[0];
  const latestSale = latestSaleRows?.[0];
  const latestSaleNo = saleNoKey(latestSale?.target_sale_no || latestSale?.sale_no);
  const navWithDetailLinks = nav.map((mod) => {
    if (mod.key === "auction-dispatch-detail" && latestDispatch?.id) {
      return { ...mod, href: `/dashboard/auction/${latestDispatch.id}` };
    }
    if (mod.key === "auction-sale-detail" && latestSaleNo) {
      return { ...mod, href: `/dashboard/auction/sales/${encodeURIComponent(latestSaleNo)}` };
    }
    return mod;
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
