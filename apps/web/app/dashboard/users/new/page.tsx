import { requireProfile } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { createUser } from "../actions";

const inputClass =
  "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none";

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireProfile(["owner"]);
  const { error } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Add user</h1>
      <p className="mt-1 text-sm text-stone-500">
        They sign in with this email using a one-time code — no password, no self-signup.
      </p>
      <form action={createUser} className="mt-6 max-w-lg space-y-4 rounded-xl border border-stone-200 bg-white p-6">
        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
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
            <option value="" disabled>
              Select role
            </option>
            <option value="owner">Owner — everything, including user management</option>
            <option value="manager">Manager — everything except user management</option>
            <option value="collector">Collector — weighing entry only</option>
          </select>
        </label>
        <p className="text-xs text-stone-500">
          Adding a collector also creates their entry on the Collectors page, so weighings they record are
          attributed to them.
        </p>
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
