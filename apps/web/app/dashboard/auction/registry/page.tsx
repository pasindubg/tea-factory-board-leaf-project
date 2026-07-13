import { requireModuleAccess } from "@/lib/profile";
import { BrokersTable, type BrokerRow } from "./brokers-table";
import { RatesTable, type RateRow } from "./rates-table";
import { MarksTable, type MarkRow } from "./marks-table";

export default async function RegistryPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const { error } = await searchParams;
  const [{ data: brokers }, { data: marks }, { data: rates }] = await Promise.all([
    supabase.from("brokers").select("id, name, vat_no, address").order("name"),
    supabase.from("marks").select("id, code, name, address").order("code"),
    supabase.from("broker_rates").select("id, broker_id, effective_from, brokerage_pct, insurance_per_kg, handling_per_kg, eplatform_per_kg, public_sale_ex_per_lot, documentation_per_lot, govt_relief_loan, charges_vat_pct, proceeds_vat_pct, brokers(name)").order("effective_from", { ascending: false }),
  ]);
  const brokerRows: BrokerRow[] = (brokers ?? []).map((b) => ({ id: b.id, name: b.name, vat_no: b.vat_no, address: b.address }));
  const markRows: MarkRow[] = (marks ?? []).map((m) => ({ id: m.id, code: m.code, name: m.name, address: m.address }));
  const rateRows: RateRow[] = (rates ?? []).map((r) => ({ id: r.id as string, brokerId: r.broker_id as string, broker: (r.brokers as unknown as { name: string } | null)?.name ?? "—", effectiveFrom: r.effective_from as string, brokeragePct: Number(r.brokerage_pct), insurancePerKg: Number(r.insurance_per_kg), handlingPerKg: Number(r.handling_per_kg), eplatformPerKg: Number(r.eplatform_per_kg), publicSaleExPerLot: Number(r.public_sale_ex_per_lot), documentationPerLot: Number(r.documentation_per_lot), govtReliefLoan: Number(r.govt_relief_loan), chargesVatPct: Number(r.charges_vat_pct), proceedsVatPct: Number(r.proceeds_vat_pct) }));
  const isOwner = profile.role === "owner";
  return <div className="space-y-10">
    {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">{error}</p>}
    <section><h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Brokers</h2><p className="text-sm text-stone-500 dark:text-stone-400">The auction houses that catalogue, value and settle your teas.</p><div className="mt-4"><BrokersTable rows={brokerRows} isOwner={isOwner} /></div></section>
    <section><h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Broker rate cards</h2><p className="text-sm text-stone-500 dark:text-stone-400">The deduction rates each settlement is computed from. The most recent effective card is applied when you confirm a sellers contract.</p><div className="mt-4"><RatesTable rows={rateRows} brokers={brokerRows.map(({ id, name }) => ({ id, name }))} isOwner={isOwner} /></div></section>
    <section><h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Estate marks</h2><p className="text-sm text-stone-500 dark:text-stone-400">The selling identities you trade under (e.g. MF1530 KUMUDU).</p><div className="mt-4"><MarksTable rows={markRows} isOwner={isOwner} /></div></section>
  </div>;
}
