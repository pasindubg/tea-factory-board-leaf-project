import Link from "next/link";
import { loadListResource } from "@/lib/list-resource-registry";
import { requirePageAccess } from "@/lib/profile";
import { RolePermissionsMatrix } from "../role-permissions-matrix";

export default async function RolePermissionsPage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const [roleContext, permissionResource] = await Promise.all([
    requirePageAccess("user-handling-roles"),
    loadListResource({ key: "users.role-page-permissions", params: { roleId } }),
  ]);
  if (!permissionResource.ok) throw new Error(permissionResource.error);
  const { data: role } = await roleContext.supabase
    .from("access_roles")
    .select("id, name, base_role, system_role")
    .eq("id", roleId)
    .maybeSingle();
  if (!role) throw new Error("Role not found.");

  return (
    <div>
      <Link href="/dashboard/user-handling/roles" className="text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">← Roles & permissions</Link>
      <h1 className="mt-3 text-2xl font-semibold">{role.name}</h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Base security level: <span className="font-medium capitalize">{role.base_role}</span>{role.system_role ? " · Built-in role" : ""}</p>
      <div className="mt-6"><RolePermissionsMatrix roleId={roleId} initialRows={permissionResource.rows} /></div>
    </div>
  );
}
