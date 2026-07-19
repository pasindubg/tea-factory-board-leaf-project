import { loadListResource } from "@/lib/list-resource-registry";
import { requirePageAccess } from "@/lib/profile";
import { RolesTable } from "./roles-table";

export default async function RolesPage() {
  const [{ profile }, roleResource] = await Promise.all([
    requirePageAccess("user-handling-roles"),
    loadListResource({ key: "users.roles" }),
  ]);
  if (!roleResource.ok) throw new Error(roleResource.error);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Roles & permissions</h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Create factory roles and choose the exact dashboard pages and CRUD actions available to them.</p>
      {profile.role !== "owner" ? null : <div className="mt-6"><RolesTable initialRows={roleResource.rows} /></div>}
    </div>
  );
}
