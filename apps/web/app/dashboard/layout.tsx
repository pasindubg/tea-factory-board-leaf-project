import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES, MODULES, type Role } from "@/lib/roles";
import { DashboardShell } from "./dashboard-shell";

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

  return (
    <DashboardShell
      factoryName={factoryName}
      profileName={profile.name}
      profileRole={profile.role}
      nav={nav}
    >
      {children}
    </DashboardShell>
  );
}
