import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/profile";
import { formatFourDigitNo } from "../../sale-number";
import { DispatchDetailLists, type DispatchInvoiceRow, type DispatchLotRow } from "../dispatch-detail-lists";
import { DispatchDetailView } from "../dispatch-detail-view";
import { type PhysicalDispatchListRow } from "../dispatch-list";

type Invoice = { id: string; sale_no: string; dispatch_date: string | null; status: string; brokers: { name: string } | null; auction_lots: Lot[] | null };
type Lot = { id: string; invoice_no: string | null; lot_no: string | null; grade: string | null; bags: number | null; net_wt: string | number | null; state: string | null };
type DispatchInvoice = { auction_sales: Invoice | null };
type DispatchListRecord = {
  id: string;
  dispatch_no: string;
  dispatch_date_from: string;
  dispatch_date_to: string;
  warehouse: string;
  status: string;
  auction_bundled_dispatch_invoices: { id: string }[] | null;
};

export default async function DispatchDetailPage({ params }: { params: Promise<{ dispatchId: string }> }) {
  const { supabase } = await requireModuleAccess("auction");
  const { dispatchId } = await params;
  const [{ data: dispatch }, { data: dispatches }, { data: links }] = await Promise.all([
    supabase
      .from("auction_bundled_dispatches")
      .select("id, dispatch_no, dispatch_date_from, dispatch_date_to, warehouse, status, created_at")
      .eq("id", dispatchId)
      .maybeSingle(),
    supabase
      .from("auction_bundled_dispatches")
      .select("id, dispatch_no, dispatch_date_from, dispatch_date_to, warehouse, status, auction_bundled_dispatch_invoices(id)")
      .order("dispatch_date_from", { ascending: false })
      .order("dispatch_no", { ascending: false }),
    supabase
      .from("auction_bundled_dispatch_invoices")
      .select("auction_sales(id, sale_no, dispatch_date, status, brokers(name), auction_lots(id, invoice_no, lot_no, grade, bags, net_wt, state))")
      .eq("bundled_dispatch_id", dispatchId),
  ]);
  if (!dispatch) notFound();

  const dispatchRows: PhysicalDispatchListRow[] = ((dispatches ?? []) as unknown as DispatchListRecord[]).map((item) => ({
    id: item.id,
    dispatchNo: formatFourDigitNo(item.dispatch_no),
    dispatchDateFrom: item.dispatch_date_from,
    dispatchDateTo: item.dispatch_date_to,
    warehouse: item.warehouse,
    invoiceCount: item.auction_bundled_dispatch_invoices?.length ?? 0,
    status: item.status,
  }));
  const invoiceRecords = ((links ?? []) as unknown as DispatchInvoice[]).flatMap((link) => link.auction_sales ? [link.auction_sales] : []).sort((a, b) => String(a.sale_no).localeCompare(String(b.sale_no)));
  const invoices: DispatchInvoiceRow[] = invoiceRecords.map((invoice) => ({ id: invoice.id, invoiceNo: formatFourDigitNo(invoice.sale_no), broker: invoice.brokers?.name ?? "—", invoiceDate: invoice.dispatch_date, lotsCount: invoice.auction_lots?.length ?? 0, status: invoice.status }));
  const lots: DispatchLotRow[] = invoiceRecords.flatMap((invoice) => (invoice.auction_lots ?? []).map((lot) => ({ id: lot.id, brokerInvoiceNo: formatFourDigitNo(invoice.sale_no), lotNo: formatFourDigitNo(lot.lot_no) || "—", grade: lot.grade ?? "—", bags: lot.bags, netWt: lot.net_wt, state: lot.state ?? "—" })));

  return <DispatchDetailView
    dispatch={{ id: dispatch.id as string, dispatchNo: formatFourDigitNo(dispatch.dispatch_no as string), dateFrom: dispatch.dispatch_date_from as string, dateTo: dispatch.dispatch_date_to as string, warehouse: dispatch.warehouse as string, status: dispatch.status as string }}
    dispatches={dispatchRows}
    invoices={invoices}
    lots={lots}
  />;
}
