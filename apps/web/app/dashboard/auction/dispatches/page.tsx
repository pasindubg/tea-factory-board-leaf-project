import { requireModuleAccess } from "@/lib/profile";
import { DispatchList, type PhysicalDispatchListRow } from "./dispatch-list";

type DispatchRow = {
  id: string;
  dispatch_no: string;
  dispatch_date_from: string;
  dispatch_date_to: string;
  warehouse: string;
  status: string;
  auction_bundled_dispatch_invoices: { id: string }[] | null;
};

export default async function DispatchOverviewPage() {
  const { supabase } = await requireModuleAccess("auction");
  const { data } = await supabase
    .from("auction_bundled_dispatches")
    .select("id, dispatch_no, dispatch_date_from, dispatch_date_to, warehouse, status, auction_bundled_dispatch_invoices(id)")
    .order("dispatch_date_from", { ascending: false })
    .order("dispatch_no", { ascending: false });
  const rows: PhysicalDispatchListRow[] = ((data ?? []) as unknown as DispatchRow[]).map((dispatch) => ({
    id: dispatch.id,
    dispatchNo: dispatch.dispatch_no,
    dispatchDateFrom: dispatch.dispatch_date_from,
    dispatchDateTo: dispatch.dispatch_date_to,
    warehouse: dispatch.warehouse,
    invoiceCount: dispatch.auction_bundled_dispatch_invoices?.length ?? 0,
    status: dispatch.status,
  }));

  return <div>
    <div>
      <h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Dispatch Overview</h2>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Review physical dispatches, their date range, warehouse, and included Broker Invoices.</p>
    </div>
    <div className="mt-5"><DispatchList rows={rows} /></div>
  </div>;
}
