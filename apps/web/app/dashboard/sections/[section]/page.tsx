import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES, MODULES, type Role } from "@/lib/roles";
import { groupForSectionSlug } from "../../section-routes";

export default async function HandlingSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const group = groupForSectionSlug(section);
  if (!group) notFound();

  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);
  const { data: overrides } = await supabase.from("module_permissions").select("module_key, allowed_roles");
  const overrideMap = Object.fromEntries((overrides ?? []).map((row) => [row.module_key, row.allowed_roles as string[]]));
  const modules = MODULES.filter((module) => {
    if (module.group !== group) return false;
    if (profile.role === "owner") return true;
    return (overrideMap[module.key] ?? [...module.roles]).includes(profile.role as Role);
  });

  return (
    <div>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">{group}</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-500 dark:text-stone-400">Choose the area you want to work in. Only destinations available to your role are shown.</p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Link
            key={module.key}
            href={module.href}
            className="group rounded-[1.5rem] border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-green-300 hover:shadow-lg dark:border-stone-700 dark:bg-stone-900 dark:hover:border-green-700"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-stone-900 group-hover:text-green-800 dark:text-stone-100 dark:group-hover:text-green-300">{module.label}</h2>
                <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Open {module.label.toLowerCase()} workspace</p>
              </div>
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-800 transition group-hover:bg-green-100 dark:bg-green-950 dark:text-green-300">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
