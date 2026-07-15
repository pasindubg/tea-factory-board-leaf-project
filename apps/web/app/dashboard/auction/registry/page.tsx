import { requireModuleAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { BrokersTable, type BrokerRow } from "./brokers-table";
import { RatesTable, type RateRow } from "./rates-table";
import { MarksTable, type MarkRow } from "./marks-table";
import { TabbedListSurface } from "@/components/list-controls";

export default async function RegistryPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { profile } = await requireModuleAccess("auction");
  const { error } = await searchParams;
  const [brokers, marks, rates] = await Promise.all([
    loadListResource({ key: "auction.brokers" }),
    loadListResource({ key: "auction.marks" }),
    loadListResource({ key: "auction.broker-rates" }),
  ]);
  if (!brokers.ok) throw new Error(brokers.error);
  if (!marks.ok) throw new Error(marks.error);
  if (!rates.ok) throw new Error(rates.error);

  const brokerRows: BrokerRow[] = brokers.rows;
  const markRows: MarkRow[] = marks.rows;
  const rateRows: RateRow[] = rates.rows;
  const isOwner = profile.role === "owner";
  return <div className="space-y-6">
    {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">{error}</p>}
    <TabbedListSurface
      tabs={[
        { id: "brokers", label: "Brokers", count: String(brokerRows.length) },
        { id: "rates", label: "Rate cards", count: String(rateRows.length) },
        { id: "marks", label: "Estate marks", count: String(markRows.length) },
      ]}
    >
      <BrokersTable rows={brokerRows} isOwner={isOwner} />
      <RatesTable rows={rateRows} brokers={brokerRows.map(({ id, name }) => ({ id, name }))} isOwner={isOwner} />
      <MarksTable rows={markRows} isOwner={isOwner} />
    </TabbedListSurface>
  </div>;
}
