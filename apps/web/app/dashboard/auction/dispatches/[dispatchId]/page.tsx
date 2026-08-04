import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/profile";
import { applyServerListSearch } from "@/lib/list-search-state";
import { loadListResource } from "@/lib/list-resource-registry";
import { formatFourDigitNo } from "../../sale-number";
import { DispatchDetailLists, type DispatchInvoiceRow, type DispatchLotRow } from "../dispatch-detail-lists";
import { DispatchDetailView } from "../dispatch-detail-view";
import { type PhysicalDispatchListRow } from "../dispatch-list";

type Invoice = { id: string; sale_no: string; dispatch_date: string | null; sale_date: string | null; status: string; brokers: { name: string } | null; marks: { code: string; name: string | null } | null; auction_lots: Lot[] | null };
type Lot = {
  id: string;
  invoice_no: string | null;
  lot_no: string | null;
  grade: string | null;
  bags: number | null;
  net_wt: string | number | null;
  state: string | null;
  marks: { code: string; name: string | null } | null;
};
type DispatchInvoice = { auction_sales: Invoice | null };

export default async function DispatchDetailPage({ params }: { params: Promise<{ dispatchId: string }> }) {
  const { supabase, profile } = await requirePageAccess("auction-dispatch-detail-view");
  const { dispatchId } = await params;
  const [{ data: dispatch }, dispatchResource, eligibleInvoicesResource, warehousesResource, { data: links }] = await Promise.all([
    supabase
      .from("auction_bundled_dispatches")
      .select("id, dispatch_no, dispatch_date_from, dispatch_date_to, warehouse, status, created_at")
      .eq("id", dispatchId)
      .maybeSingle(),
    loadListResource({ key: "auction.physical-dispatches" }),
    loadListResource({ key: "auction.eligible-broker-invoices" }),
    loadListResource({ key: "auction.warehouses" }),
    supabase
      .from("auction_bundled_dispatch_invoices")
      // auction_sales has a single FK to marks (selling_mark_id), so this
      // embed resolves the invoice's own selling mark unambiguously.
      .select("auction_sales(id, sale_no, dispatch_date, sale_date, status, brokers(name), marks(code, name), auction_lots(id, invoice_no, lot_no, grade, bags, net_wt, state, marks(code, name)))")
      .eq("bundled_dispatch_id", dispatchId),
  ]);
  if (!dispatch) notFound();

  if (!dispatchResource.ok) throw new Error(dispatchResource.error);
  if (!eligibleInvoicesResource.ok) throw new Error(eligibleInvoicesResource.error);
  if (!warehousesResource.ok) throw new Error(warehousesResource.error);
  const dispatchRows: PhysicalDispatchListRow[] = dispatchResource.rows;
  const invoiceRecords = ((links ?? []) as unknown as DispatchInvoice[]).flatMap((link) => link.auction_sales ? [link.auction_sales] : []).sort((a, b) => String(a.sale_no).localeCompare(String(b.sale_no)));
  const invoices: DispatchInvoiceRow[] = invoiceRecords.map((invoice) => ({
    id: invoice.id,
    invoiceNo: formatFourDigitNo(invoice.sale_no),
    broker: invoice.brokers?.name ?? "—",
    sellingMark: invoice.marks ? `${invoice.marks.code}${invoice.marks.name ? ` — ${invoice.marks.name}` : ""}` : "—",
    invoiceDate: invoice.dispatch_date,
    saleDate: invoice.sale_date,
    lotsCount: invoice.auction_lots?.length ?? 0,
    // The invoice carries no net weight of its own — it is the sum of the lots
    // sitting under it, the same total the broker invoice detail page shows.
    netWt: (invoice.auction_lots ?? []).reduce((sum, lot) => sum + Number(lot.net_wt ?? 0), 0),
    status: invoice.status,
  }));
  const lots: DispatchLotRow[] = invoiceRecords.flatMap((invoice) => (invoice.auction_lots ?? []).map((lot) => ({
    id: lot.id,
    invoiceNo: lot.invoice_no ?? "—",
    brokerInvoiceNo: formatFourDigitNo(invoice.sale_no),
    broker: invoice.brokers?.name ?? "—",
    mark: lot.marks ? `${lot.marks.code}${lot.marks.name ? ` — ${lot.marks.name}` : ""}` : "—",
    lotNo: formatFourDigitNo(lot.lot_no) || "—",
    grade: lot.grade ?? "—",
    bags: lot.bags,
    netWt: lot.net_wt,
    state: lot.state ?? "—",
  })));

  const [visibleInvoices, visibleLots] = await Promise.all([
    applyServerListSearch(supabase, profile, "dispatch-detail-invoices", invoices),
    applyServerListSearch(supabase, profile, "dispatch-detail-lots", lots),
  ]);

  return <DispatchDetailView
    dispatch={{
      id: dispatch.id as string,
      dispatchNo: formatFourDigitNo(dispatch.dispatch_no as string),
      dateFrom: dispatch.dispatch_date_from as string,
      dateTo: dispatch.dispatch_date_to as string,
      warehouse: dispatch.warehouse as string,
      status: dispatch.status as string,
      createdAt: (dispatch.created_at as string | null) ?? null,
    }}
    dispatches={dispatchRows}
    invoices={visibleInvoices}
    lots={visibleLots}
    eligibleInvoices={eligibleInvoicesResource.rows}
    warehouses={warehousesResource.rows}
    canCreate={profile.role === "owner" || profile.role === "manager"}
    isOwner={profile.role === "owner"}
  />;
}
