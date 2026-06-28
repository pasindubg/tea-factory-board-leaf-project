import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { createBroker, createMark } from "../actions";

const input = "mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm";
const label = "block text-sm font-medium text-stone-600 dark:text-stone-400";
const addBtn = "rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700";

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase } = await requireModuleAccess("auction");
  const { error } = await searchParams;
  const { data: brokers } = await supabase
    .from("brokers")
    .select("id, name, vat_no, address")
    .order("name");
  const { data: marks } = await supabase.from("marks").select("id, code, name, address").order("code");

  return (
    <div className="space-y-10">
      {error && <p className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

      <section>
        <h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Brokers</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">The auction houses that catalogue, value and settle your teas.</p>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">VAT no.</th>
                </tr>
              </thead>
              <tbody>
                {(brokers ?? []).map((b) => (
                  <tr key={b.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                    <td className="px-4 py-3 font-medium">{b.name}</td>
                    <td className="px-4 py-3">{b.vat_no ?? "—"}</td>
                  </tr>
                ))}
                {(brokers ?? []).length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">
                      No brokers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <form action={createBroker} className="space-y-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
            <div>
              <label className={label}>Name</label>
              <input name="name" required placeholder="BPML Produce Marketing" className={input} />
            </div>
            <div>
              <label className={label}>VAT no.</label>
              <input name="vat_no" placeholder="114107670-7000" className={input} />
            </div>
            <div>
              <label className={label}>Address</label>
              <input name="address" className={input} />
            </div>
            <SubmitButton pendingText="Adding…" className={addBtn}>
              Add broker
            </SubmitButton>
          </form>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Estate marks</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">The selling identities you trade under (e.g. MF1530 KUMUDU).</p>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Name</th>
                </tr>
              </thead>
              <tbody>
                {(marks ?? []).map((m) => (
                  <tr key={m.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                    <td className="px-4 py-3 font-medium">{m.code}</td>
                    <td className="px-4 py-3">{m.name}</td>
                  </tr>
                ))}
                {(marks ?? []).length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">
                      No marks yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <form action={createMark} className="space-y-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
            <div>
              <label className={label}>Mark code</label>
              <input name="code" required placeholder="MF1530" className={input} />
            </div>
            <div>
              <label className={label}>Name</label>
              <input name="name" required placeholder="KUMUDU" className={input} />
            </div>
            <div>
              <label className={label}>Address</label>
              <input name="address" placeholder="Miriswatte, Ittapana" className={input} />
            </div>
            <SubmitButton pendingText="Adding…" className={addBtn}>
              Add mark
            </SubmitButton>
          </form>
        </div>
      </section>
    </div>
  );
}
