import { storageFor } from "@/lib/db/storage";
import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES, ROLE_LABELS } from "@/lib/roles";
import { visibleModules } from "@/lib/visible-modules";
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
    ? await storageFor(supabase, profile.factory_id).from("factory-branding").createSignedUrl(factory.logo_path, 60 * 60 * 24)
    : { data: null };

  const nav = await visibleModules(supabase, profile);
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
