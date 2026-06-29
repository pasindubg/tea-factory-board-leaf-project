import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES, MODULES, type Role } from "@/lib/roles";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";

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
    <div className="flex h-screen bg-stone-50 dark:bg-stone-950">
      <aside className="flex w-56 shrink-0 flex-col border-r border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 print:hidden">
        <div className="border-b border-stone-200 dark:border-stone-700 p-4">
          <p className="text-sm font-semibold text-green-800 dark:text-green-400">{factoryName}</p>
          <p className="text-xs text-stone-500 dark:text-stone-400">Tea Factory Ops</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav items={nav} />
        </div>
        <div className="border-t border-stone-200 dark:border-stone-700 p-4">
          <p className="text-sm font-medium text-stone-700 dark:text-stone-300">{profile.name}</p>
          <p className="text-xs capitalize text-stone-500 dark:text-stone-400">{profile.role}</p>
          <div className="mt-3 space-y-2">
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <button className="w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-1.5 text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
