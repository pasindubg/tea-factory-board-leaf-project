import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/profile";
import { formatFourDigitNo } from "../../sale-number";
import { DispatchDetailLists, type DispatchInvoiceRow, type DispatchLotRow } from "../dispatch-detail-lists";

type Invoice = { id: string; sale_no: string; dispatch_date: string | null; status: string; brokers: { name: string } | null; auction_lots: Lot[] | null };
type Lot = { id: string; invoice_no: string | null; lot_no: string | null; grade: string | null; bags: number | null; net_wt: string | number | null; state: string | null };
type DispatchInvoice = { auction_sales: Invoice | null };

function dateRange(from: string, to: string) { return from === to ? from : `${from} – ${to}`; }

export default async function DispatchDetailPage({ params }: { params: Promise<{ dispatchId: string }> }) {
  const { supabase } = await requireModuleAccess("auction");
  const { dispatchId } = await params;
  const { data: dispatch } = await supabase
    .from("auction_bundled_dispatches")
    .select("id, dispatch_no, dispatch_date_from, dispatch_date_to, warehouse, status, created_at")
    .eq("id", dispatchId)
    .maybeSingle();
  if (!dispatch) notFound();

  const { data: links } = await supabase
    .from("auction_bundled_dispatch_invoices")
    .select("auction_sales(id, sale_no, dispatch_date, status, brokers(name), auction_lots(id, invoice_no, lot_no, grade, bags, net_wt, state))")
    .eq("bundled_dispatch_id", dispatchId);
  const invoiceRecords = ((links ?? []) as unknown as DispatchInvoice[]).flatMap((link) => link.auction_sales ? [link.auction_sales] : []).sort((a, b) => String(a.sale_no).localeCompare(String(b.sale_no)));
  const invoices: DispatchInvoiceRow[] = invoiceRecords.map((invoice) => ({ id: invoice.id, invoiceNo: formatFourDigitNo(invoice.sale_no), broker: invoice.brokers?.name ?? "—", invoiceDate: invoice.dispatch_date, lotsCount: invoice.auction_lots?.length ?? 0, status: invoice.status }));
  const lots: DispatchLotRow[] = invoiceRecords.flatMap((invoice) => (invoice.auction_lots ?? []).map((lot) => ({ id: lot.id, brokerInvoiceNo: formatFourDigitNo(invoice.sale_no), lotNo: formatFourDigitNo(lot.lot_no) || "—", grade: lot.grade ?? "—", bags: lot.bags, netWt: lot.net_wt, state: lot.state ?? "—" })));

  return <div className="space-y-6">
    <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-700 dark:bg-stone-900">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-stone-500 dark:text-stone-400">Dispatch details</p><h2 className="mt-1 font-mono text-2xl font-semibold text-stone-800 dark:text-stone-100">{dispatch.dispatch_no}</h2></div><span className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-300">{dispatch.status}</span></div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-stone-500 dark:text-stone-400">Dispatch date(s)</dt><dd className="mt-1 font-medium text-stone-800 dark:text-stone-100">{dateRange(dispatch.dispatch_date_from as string, dispatch.dispatch_date_to as string)}</dd></div><div><dt className="text-xs text-stone-500 dark:text-stone-400">Warehouse</dt><dd className="mt-1 font-medium text-stone-800 dark:text-stone-100">{dispatch.warehouse}</dd></div><div><dt className="text-xs text-stone-500 dark:text-stone-400">Broker Invoices</dt><dd className="mt-1 font-medium text-stone-800 dark:text-stone-100">{invoices.length}</dd></div><div><dt className="text-xs text-stone-500 dark:text-stone-400">Lots</dt><dd className="mt-1 font-medium text-stone-800 dark:text-stone-100">{lots.length}</dd></div></dl>
    </div>

    <DispatchDetailLists lots={lots} invoices={invoices} />
  </div>;
}
