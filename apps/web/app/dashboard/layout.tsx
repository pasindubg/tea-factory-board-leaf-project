import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES, MODULES, type Role } from "@/lib/roles";
import { DashboardShell } from "./dashboard-shell";
import { saleNoKey } from "./auction/sale-number";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);

  const { data: factory } = await supabase
    .from("factories")
    .select("name")
    .eq("id", profile.factory_id)
    .single();
  const factoryName = factory?.name ?? "Unknown factory";

  // Fetch per-factory module permission overrides (small table, fast).
  const { data: overrides } = await supabase
    .from("module_permissions")
    .select("module_key, allowed_roles");

  const overrideMap = Object.fromEntries(
    (overrides ?? []).map((r) => [r.module_key, r.allowed_roles as string[]]),
  );

  // Owner always sees everything; others respect overrides → defaults.
  const nav = MODULES.filter((mod) => {
    if (profile.role === "owner") return true;
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
      profileName={profile.name}
      profileRole={profile.role}
      nav={navWithDetailLinks}
    >
      {children}
    </DashboardShell>
  );
}
