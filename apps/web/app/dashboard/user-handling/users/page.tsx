import Link from "next/link";
import { loadListResource } from "@/lib/list-resource-registry";
import { requirePageAccess } from "@/lib/profile";
import { UsersTable } from "../../users/users-table";

export default async function UserHandlingUsersPage() {
  const [{ profile }, userResource, rolesResource] = await Promise.all([
    requirePageAccess("user-handling-users"),
    loadListResource({ key: "users.accounts" }),
    loadListResource({ key: "users.roles" }),
  ]);
  if (!userResource.ok) throw new Error(userResource.error);
  if (!rolesResource.ok) throw new Error(rolesResource.error);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Logins for your factory. <Link href="/dashboard/user-handling/roles" className="text-green-700 hover:underline dark:text-green-400">Manage roles and permissions →</Link></p>
      <div className="mt-6"><UsersTable initialRows={userResource.rows} currentUserId={profile.id} roles={rolesResource.rows} /></div>
    </div>
  );
}
