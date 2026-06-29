import { requireProfile } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { ROLE_LABELS } from "@/lib/roles";
import { setUserActive, resetUserPassword } from "./actions";
import { RemoveUserButton } from "./remove-user-button";

const roleBadge: Record<string, string> = {
  owner:      "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400",
  manager:    "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400",
  supervisor: "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-400",
  accountant: "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-400",
  collector:  "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300",
};

const inputClass =
  "rounded-md border border-stone-300 dark:border-stone-600 px-2 py-1 text-sm focus:border-green-600 dark:focus:border-green-500 focus:outline-none";

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

      <div className="mt-6 overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => {
              const isSelf    = u.id === profile.id;
              const isActive  = u.active !== false;
              const isOwnerRow = u.role === "owner";
              // Managers cannot act on owner rows.
              const canAct    = !isSelf && (isOwner || !isOwnerRow);

              return (
                <tr key={u.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {u.name}
                    {isSelf && <span className="ml-2 text-xs font-normal text-stone-400 dark:text-stone-500">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-400">{u.email}</td>
                  <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{u.username ?? <span className="italic text-stone-300 dark:text-stone-600">none</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge[u.role] ?? ""}`}>
                      {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        isActive ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400" : "bg-stone-200 text-stone-600 dark:text-stone-400"
                      }`}
                    >
                      {isActive ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {canAct && (
                      <details className="group relative">
                        <summary className="cursor-pointer list-none text-sm text-green-700 dark:text-green-400 hover:underline">
                          Actions ▾
                        </summary>
                        <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-3 shadow-md">
                          {/* Activate / Deactivate */}
                          <form action={setUserActive} className="mb-2">
                            <input type="hidden" name="user_id" value={u.id} />
                            <input type="hidden" name="next_active" value={isActive ? "false" : "true"} />
                            <SubmitButton pendingText="…" className="w-full rounded-md border border-stone-200 dark:border-stone-700 px-3 py-1.5 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-800">
                              {isActive ? "Deactivate" : "Reactivate"}
                            </SubmitButton>
                          </form>

                          {/* Set / reset credentials */}
                          <form action={resetUserPassword} className="space-y-2 border-t border-stone-100 dark:border-stone-800 pt-2">
                            <input type="hidden" name="user_id" value={u.id} />
                            <p className="text-xs font-medium text-stone-500 dark:text-stone-400">Set credentials</p>
                            <input
                              name="username"
                              placeholder="Username"
                              defaultValue={u.username ?? ""}
                              autoComplete="off"
                              className={`${inputClass} w-full`}
                            />
                            <input
                              name="password"
                              type="password"
                              placeholder="New password"
                              autoComplete="new-password"
                              className={`${inputClass} w-full`}
                            />
                            <SubmitButton pendingText="Saving…" className="w-full rounded-md bg-green-700 dark:bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-800 dark:hover:bg-green-700">
                              Save
                            </SubmitButton>
                          </form>

                          {/* Remove */}
                          <div className="border-t border-stone-100 dark:border-stone-800 pt-2">
                            <RemoveUserButton userId={u.id} userName={u.name} />
                          </div>
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
            {(users ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
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
