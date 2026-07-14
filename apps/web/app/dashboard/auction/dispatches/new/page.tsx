import { requireModuleAccess } from "@/lib/profile";
import { formatFourDigitNo } from "../../sale-number";
import { BundledDispatchForm, type EligibleBrokerInvoice } from "./bundled-dispatch-form";

export default async function NewBundledDispatchPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { supabase } = await requireModuleAccess("auction");
  const { error } = await searchParams;
  const [{ data: invoices }, { data: warehouses }] = await Promise.all([
    supabase
      .from("auction_sales")
      .select("id, sale_no, dispatch_date, status, brokers(name), auction_lots(id)")
      .eq("sale_kind", "dispatch")
      .is("bundled_dispatch_id", null)
      .order("dispatch_date", { ascending: false })
      .order("sale_no", { ascending: false }),
    supabase.from("auction_warehouses").select("id, name, active").order("name"),
  ]);

  const rows: EligibleBrokerInvoice[] = (invoices ?? []).map((invoice) => ({
    id: invoice.id as string,
    invoiceNo: formatFourDigitNo(invoice.sale_no as string),
    broker: (invoice.brokers as unknown as { name?: string } | null)?.name ?? "—",
    invoiceDate: String(invoice.dispatch_date ?? "").slice(0, 10),
    status: invoice.status as string,
    lotCount: (invoice.auction_lots as unknown as { id: string }[] | null)?.length ?? 0,
  }));

  return (
    <div className="max-w-4xl">
      <h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">New Dispatch</h2>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        Create one physical dispatch from Broker Invoices in a chosen date or date range. All lots stay attached to their own Broker Invoice.
      </p>
      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <BundledDispatchForm
        invoices={rows}
        warehouses={(warehouses ?? []).map((warehouse) => ({
          id: warehouse.id as string,
          name: warehouse.name as string,
          active: warehouse.active as boolean,
        }))}
      />
    </div>
  );
}
