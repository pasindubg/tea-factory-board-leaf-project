import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { createSale } from "../actions";

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase } = await requireModuleAccess("auction");
  const { error } = await searchParams;
  const { data: brokers } = await supabase.from("brokers").select("id, name").order("name");

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-medium text-stone-700">New sale</h2>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {(brokers ?? []).length === 0 ? (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
          Add a broker first under{" "}
          <a href="/dashboard/auction/registry" className="font-medium underline">
            Brokers &amp; marks
          </a>
          .
        </p>
      ) : (
        <form action={createSale} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-600">Broker</label>
            <select
              name="broker_id"
              required
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            >
              {(brokers ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600">Sale number</label>
            <input
              name="sale_no"
              required
              placeholder="2026-023"
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600">Sale date</label>
            <input
              type="date"
              name="sale_date"
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <SubmitButton
              pendingText="Creating…"
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
            >
              Create sale
            </SubmitButton>
            <a
              href="/dashboard/auction"
              className="rounded-md border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              Cancel
            </a>
          </div>
        </form>
      )}
    </div>
  );
}
