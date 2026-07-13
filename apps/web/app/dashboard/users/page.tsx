import { requireProfile } from "@/lib/profile";
import { UsersTable, type UserRow } from "./users-table";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { supabase, profile } = await requireProfile(["owner"]);
  const { error, notice } = await searchParams;
  const isOwner = profile.role === "owner";

  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, username, phone, role, active, created_at")
    .order("created_at");

  const rows: UserRow[] = (users ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username,
    role: u.role,
    active: u.active !== false,
  }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Logins for your factory.
            {isOwner && (
              <a href="/dashboard/users/permissions" className="ml-2 text-green-700 dark:text-green-400 hover:underline">
                Manage module permissions →
              </a>
            )}
          </p>
        </div>
        <a
          href="/dashboard/users/new"
          className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
        >
          Add user
        </a>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-400" role="alert">{error}</p>
      )}
      {notice && (
        <p className="mt-4 rounded-md bg-green-50 dark:bg-green-950 p-3 text-sm text-green-800 dark:text-green-400" role="status">{notice}</p>
      )}

      <div className="mt-6">
        <UsersTable rows={rows} currentUserId={profile.id} isOwner={isOwner} />
      </div>
    </div>
  );
}
