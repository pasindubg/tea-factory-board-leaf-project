import { requireProfile } from "@/lib/profile";
import { setUserActive } from "./actions";
import { RemoveUserButton } from "./remove-user-button";

const roleBadge: Record<string, string> = {
  owner: "bg-green-100 text-green-800",
  manager: "bg-blue-100 text-blue-800",
  collector: "bg-amber-100 text-amber-800",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { supabase, profile } = await requireProfile(["owner"]);
  const { error, notice } = await searchParams;

  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, phone, role, active, created_at")
    .order("created_at");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <a
          href="/dashboard/users/new"
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          Add user
        </a>
      </div>
      <p className="mt-1 text-sm text-stone-500">
        Logins for your factory. Collectors get a weighing-entry-only view of this dashboard.
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800" role="status">
          {notice}
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => {
              const isSelf = u.id === profile.id;
              const isActive = u.active !== false;
              return (
                <tr key={u.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {u.name}
                    {isSelf && <span className="ml-2 text-xs font-normal text-stone-400">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-stone-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge[u.role] ?? ""}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        isActive ? "bg-green-100 text-green-800" : "bg-stone-200 text-stone-600"
                      }`}
                    >
                      {isActive ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!isSelf && (
                      <div className="flex items-center justify-end gap-4">
                        <form action={setUserActive}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <input type="hidden" name="next_active" value={isActive ? "false" : "true"} />
                          <button className="text-sm text-stone-600 hover:underline">
                            {isActive ? "Deactivate" : "Reactivate"}
                          </button>
                        </form>
                        <RemoveUserButton userId={u.id} userName={u.name} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {(users ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-400">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
