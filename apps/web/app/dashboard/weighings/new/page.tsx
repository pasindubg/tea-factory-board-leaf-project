import { collectorForUser, requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES } from "@/lib/roles";
import { createWeighing } from "../actions";

const inputClass =
  "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none";

function localDatetimeValue(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  const offset = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

export default async function NewWeighingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);
  const { error } = await searchParams;

  const isCollector = profile.role === "collector";
  const [{ data: suppliers }, { data: collectors }, ownCollector] = await Promise.all([
    supabase.from("suppliers").select("id, name, area").eq("active", true).order("name"),
    isCollector
      ? Promise.resolve({ data: [] as { id: string; name: string }[] })
      : supabase.from("collectors").select("id, name").eq("active", true).order("name"),
    isCollector ? collectorForUser(supabase, profile.id) : Promise.resolve(null),
  ]);

  if (isCollector && !ownCollector) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Record weighing</h1>
        <p className="mt-6 max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Your login has no collector record yet, so weighings can&apos;t be attributed to you. Ask the
          factory owner to link one on the Collectors page.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Record weighing</h1>
      <form action={createWeighing} className="mt-6 max-w-lg space-y-4 rounded-xl border border-stone-200 bg-white p-6">
        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <label className="block text-sm font-medium">
          Supplier *
          <select name="supplier_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select supplier
            </option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.area ? ` (${s.area})` : ""}
              </option>
            ))}
          </select>
        </label>
        {isCollector ? (
          <p className="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-600">
            Recording as <span className="font-medium">{ownCollector!.name}</span>
          </p>
        ) : (
          <label className="block text-sm font-medium">
            Collector *
            <select name="collector_id" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select collector
              </option>
              {(collectors ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium">
          Weight (kg) *
          <input name="weight_kg" type="number" step="0.01" min="0.01" required className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Collected at
          <input name="collected_at" type="datetime-local" defaultValue={localDatetimeValue()} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Notes
          <input name="notes" className={inputClass} />
        </label>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            Record weighing
          </button>
          <a href="/dashboard/weighings" className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100">
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
