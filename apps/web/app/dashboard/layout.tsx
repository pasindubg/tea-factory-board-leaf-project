import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("name, role, factory_id, factories(name)")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // authenticated but not provisioned for any factory
    await supabase.auth.signOut();
    redirect("/login?error=collector_role");
  }
  if (profile.role === "collector") {
    await supabase.auth.signOut();
    redirect("/login?error=collector_role");
  }

  const factoryName = (profile.factories as unknown as { name: string } | null)?.name ?? "Unknown factory";

  const nav = [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/weighings", label: "Weighings" },
    { href: "/dashboard/suppliers", label: "Suppliers" },
    { href: "/dashboard/collectors", label: "Collectors" },
  ];

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
