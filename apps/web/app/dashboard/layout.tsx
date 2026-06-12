import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES, modulesForRole } from "@/lib/roles";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // All active roles may enter the shell; per-page gates narrow further.
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);

  const { data: factory } = await supabase
    .from("factories")
    .select("name")
    .eq("id", profile.factory_id)
    .single();
  const factoryName = factory?.name ?? "Unknown factory";

  const nav = modulesForRole(profile.role);

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-green-800">{factoryName}</p>
            <p className="text-xs text-stone-500">Tea Factory Ops</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-stone-600">
              {profile.name} · {profile.role}
            </span>
            <form action="/auth/signout" method="post">
              <button className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-t-md px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
