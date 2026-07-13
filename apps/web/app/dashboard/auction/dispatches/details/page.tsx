import { requireModuleAccess } from "@/lib/profile";
import { DispatchList, type PhysicalDispatchListRow } from "../dispatch-list";

type DispatchRow = {
  id: string;
  dispatch_no: string;
  dispatch_date_from: string;
  dispatch_date_to: string;
  warehouse: string;
  status: string;
  auction_bundled_dispatch_invoices: { id: string }[] | null;
};

export default async function DispatchDetailsPage() {
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
    <h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Dispatch Details</h2>
    <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Select a physical dispatch, then open its dispatch number to view its basic information, Broker Invoices, and invoice lots.</p>
    <div className="mt-5"><DispatchList rows={rows} emptyMessage="No dispatches are available to view." /></div>
  </div>;
}
