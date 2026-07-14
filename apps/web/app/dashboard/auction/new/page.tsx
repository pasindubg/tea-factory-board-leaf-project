import Link from "next/link";
import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { createDispatch } from "../actions";
import { colomboToday, nextDispatchNo } from "../_actions/_shared";

export default async function NewDispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase } = await requireModuleAccess("auction");
  const { error } = await searchParams;
  const [{ data: brokers }, { data: marks }] = await Promise.all([
    supabase.from("brokers").select("id, name").order("name"),
    supabase.from("marks").select("id, code, name").order("code"),
  ]);
  const dispatchNo = await nextDispatchNo(supabase);

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">New broker invoice</h2>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        Pick the broker and sale details. The broker invoice number is assigned by the
        system, and you&apos;ll add the lot invoices (invoice no., grade, bags) on the
        next screen.
      </p>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>
      )}

      {(brokers ?? []).length === 0 || (marks ?? []).length === 0 ? (
        <p className="mt-4 rounded-md bg-amber-50 dark:bg-amber-950 px-3 py-3 text-sm text-amber-800 dark:text-amber-400">
          Add a broker and selling mark first under{" "}
          <Link href="/dashboard/auction/registry" className="font-medium underline">
            Brokers &amp; marks
          </Link>
          .
        </p>
      ) : (
        <form action={createDispatch} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400">Broker</label>
            <select
              name="broker_id"
              required
              className="mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm"
            >
              {(brokers ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400">Selling mark</label>
            <select name="selling_mark_id" required defaultValue="" className="mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm">
              <option value="" disabled>Select selling mark</option>
              {(marks ?? []).map((mark) => <option key={mark.id} value={mark.id}>{mark.code}{mark.name ? ` — ${mark.name}` : ""}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-600 dark:text-stone-400">Broker lorry no. <span className="font-normal text-stone-400">(optional)</span></label>
              <input name="broker_lorry_no" className="mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-600 dark:text-stone-400">Driver <span className="font-normal text-stone-400">(optional)</span></label>
              <input name="driver_name" className="mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400">Broker invoice number</label>
            <div className="mt-1 rounded-md border border-stone-300 dark:border-stone-600 bg-stone-50 dark:bg-stone-800 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">System generated</p>
                  <p className="font-mono text-sm font-medium tabular-nums text-stone-800 dark:text-stone-200">{dispatchNo}</p>
                </div>
                <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-white/80 dark:bg-stone-900 px-2 py-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">
                  Locked
                </span>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400">Sale number</label>
            <input
              name="target_sale_no"
              required
              placeholder="023"
              className="mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400">Dispatch date <span className="text-red-500">*</span></label>
            <input
              type="date"
              name="dispatch_date"
              required
              defaultValue={colomboToday()}
              className="mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400">
              Sale date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="sale_date"
              required
              className="mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <SubmitButton
              pendingText="Creating…"
              className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
            >
              Create broker invoice
            </SubmitButton>
            <Link
              href="/dashboard/auction"
              className="rounded-md border border-stone-300 dark:border-stone-600 px-4 py-2 text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
