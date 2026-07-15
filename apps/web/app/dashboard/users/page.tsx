import Link from "next/link";
import { loadListResource } from "@/lib/list-resource-registry";
import { requireProfile } from "@/lib/profile";
import { UsersTable } from "./users-table";

export default async function UsersPage() {
  const [{ profile }, userResource] = await Promise.all([
    requireProfile(["owner"]),
    loadListResource({ key: "users.accounts" }),
  ]);
  if (!userResource.ok) throw new Error(userResource.error);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Logins for your factory.
          <Link href="/dashboard/users/permissions" className="ml-2 text-green-700 hover:underline dark:text-green-400">
            Manage module permissions →
          </Link>
        </p>
      </div>

      <div className="mt-6">
        <UsersTable initialRows={userResource.rows} currentUserId={profile.id} />
      </div>
    </div>
  );
}
