import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { createBroker, createMark, createBrokerRate } from "../actions";

const input = "mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm";
const label = "block text-sm font-medium text-stone-600 dark:text-stone-400";
const addBtn = "rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700";

// The rate-card fields, in the order they appear in the form/table.
const RATE_FIELDS: { key: string; label: string; placeholder: string; default?: string }[] = [
  { key: "brokerage_pct", label: "Brokerage %", placeholder: "1.000" },
  { key: "insurance_per_kg", label: "Insurance /kg", placeholder: "0.0000" },
  { key: "handling_per_kg", label: "Handling /kg", placeholder: "0.0000" },
  { key: "eplatform_per_kg", label: "e-Platform /kg", placeholder: "0.0000" },
  { key: "public_sale_ex_per_lot", label: "Public sale ex. /lot", placeholder: "0.00" },
  { key: "documentation_per_lot", label: "Documentation /lot", placeholder: "0.00" },
  { key: "govt_relief_loan", label: "Govt relief loan", placeholder: "0.00" },
  { key: "charges_vat_pct", label: "Charges VAT %", placeholder: "18", default: "18" },
  { key: "proceeds_vat_pct", label: "Proceeds VAT %", placeholder: "18", default: "18" },
];

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const isOwner = profile.role === "owner";
  const { error } = await searchParams;
  const { data: brokers } = await supabase
    .from("brokers")
    .select("id, name, vat_no, address")
    .order("name");
  const { data: marks } = await supabase.from("marks").select("id, code, name, address").order("code");
  const { data: rates } = await supabase
    .from("broker_rates")
    .select("id, effective_from, brokerage_pct, insurance_per_kg, handling_per_kg, eplatform_per_kg, public_sale_ex_per_lot, documentation_per_lot, govt_relief_loan, charges_vat_pct, proceeds_vat_pct, brokers(name)")
    .order("effective_from", { ascending: false });

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
        <h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Broker rate cards</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          The deduction rates each settlement is computed from. Settlements stay empty until the broker has a rate card —
          the most recent card (by effective date) is applied when you confirm a sellers contract.
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  <th className="px-3 py-3">Broker</th>
                  <th className="px-3 py-3">Effective</th>
                  <th className="px-3 py-3 text-right">Brokerage</th>
                  <th className="px-3 py-3 text-right">Ins./kg</th>
                  <th className="px-3 py-3 text-right">Charges VAT</th>
                </tr>
              </thead>
              <tbody>
                {(rates ?? []).map((r) => (
                  <tr key={r.id as string} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                    <td className="px-3 py-3 font-medium">{(r.brokers as unknown as { name: string } | null)?.name ?? "—"}</td>
                    <td className="px-3 py-3">{r.effective_from as string}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{Number(r.brokerage_pct).toFixed(3)}%</td>
                    <td className="px-3 py-3 text-right tabular-nums">{Number(r.insurance_per_kg).toFixed(4)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{Number(r.charges_vat_pct).toFixed(0)}%</td>
                  </tr>
                ))}
                {(rates ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">
                      No rate cards yet — add one so settlements can be computed.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {isOwner ? (
            <form action={createBrokerRate} className="space-y-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Broker</label>
                  <select name="broker_id" required defaultValue="" className={input}>
                    <option value="" disabled>Pick a broker…</option>
                    {(brokers ?? []).map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Effective from</label>
                  <input type="date" name="effective_from" required defaultValue={new Date().toISOString().split("T")[0]} className={input} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {RATE_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className={label}>{f.label}</label>
                    <input
                      name={f.key}
                      type="number"
                      step="any"
                      min="0"
                      defaultValue={f.default}
                      placeholder={f.placeholder}
                      className={input}
                    />
                  </div>
                ))}
              </div>
              <SubmitButton pendingText="Saving…" className={addBtn}>
                Save rate card
              </SubmitButton>
            </form>
          ) : (
            <p className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 p-4 text-sm text-stone-500 dark:text-stone-400">
              Only the factory owner can add or change rate cards.
            </p>
          )}
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
