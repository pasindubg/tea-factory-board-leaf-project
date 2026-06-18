import { requireProfile } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { createUser } from "../actions";
import { MANAGEMENT_ROLES } from "@/lib/roles";

const inputClass =
  "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none";

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { profile } = await requireProfile(MANAGEMENT_ROLES);
  const { error } = await searchParams;
  const isOwner = profile.role === "owner";

  return (
    <div>
      <h1 className="text-2xl font-semibold">Add user</h1>
      <p className="mt-1 text-sm text-stone-500">
        Set a username and password so they can sign in directly, or leave those blank and they will use
        a one-time email code instead.
      </p>
      <form action={createUser} className="mt-6 max-w-lg space-y-4 rounded-xl border border-stone-200 bg-white p-6">
        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="space-y-4 border-b border-stone-100 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Profile</p>
          <label className="block text-sm font-medium">
            Name *
            <input name="name" required className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Email *
            <input name="email" type="email" required className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Phone
            <input name="phone" className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Role *
            <select name="role" required defaultValue="" className={inputClass}>
              <option value="" disabled>Select role</option>
              {isOwner && <option value="owner">Owner — everything, including user management</option>}
              <option value="manager">Manager — everything except user management</option>
              <option value="supervisor">Supervisor — weighings, suppliers and collectors (no financials)</option>
              <option value="accountant">Accountant — payments and suppliers (no operations)</option>
              <option value="collector">Collector — weighing entry only</option>
            </select>
          </label>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Password login <span className="font-normal normal-case text-stone-400">(optional)</span>
          </p>
          <label className="block text-sm font-medium">
            Username
            <input
              name="username"
              autoComplete="off"
              placeholder="e.g. john.silva"
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Leave blank to use email code only"
              className={inputClass}
            />
          </label>
          <p className="text-xs text-stone-500">
            If a username and password are set the user can sign in from the &ldquo;Username&rdquo; tab on
            the login page. They can still use email codes at any time.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <SubmitButton
            pendingText="Adding…"
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            Add user
          </SubmitButton>
          <a href="/dashboard/users" className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100">
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
