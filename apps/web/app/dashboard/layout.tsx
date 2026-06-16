import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES, MODULES, type Role } from "@/lib/roles";
import { SidebarNav } from "./sidebar-nav";

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
    <div className="flex h-screen bg-stone-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-stone-200 bg-white print:hidden">
        <div className="border-b border-stone-200 p-4">
          <p className="text-sm font-semibold text-green-800">{factoryName}</p>
          <p className="text-xs text-stone-500">Tea Factory Ops</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav items={nav} />
        </div>
        <div className="border-t border-stone-200 p-4">
          <p className="text-sm font-medium text-stone-700">{profile.name}</p>
          <p className="text-xs capitalize text-stone-500">{profile.role}</p>
          <form action="/auth/signout" method="post" className="mt-3">
            <button className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
