import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { DispatchesTable } from "./dispatches-table";
import { colomboToday, nextDispatchNo } from "./_actions/_shared";
import { resolveInvoicePrefix } from "./invoice-number";

export default async function AuctionSalesPage() {
  const { supabase, profile } = await requirePageAccess("auction-invoices");
  const isOwner = profile.role === "owner";
  const [dispatches, brokers, marks, { data: prefixRows }] = await Promise.all([
    loadListResource({ key: "auction.dispatches" }),
    loadListResource({ key: "auction.brokers" }),
    loadListResource({ key: "auction.marks" }),
    supabase.from("invoice_number_prefixes").select("id, prefix, active").eq("category", "broker_invoice").order("prefix"),
  ]);

  if (!dispatches.ok) throw new Error(dispatches.error);
  if (!brokers.ok) throw new Error(brokers.error);
  if (!marks.ok) throw new Error(marks.error);

  const prefixes = (prefixRows ?? []) as { id: string; prefix: string; active: boolean }[];
  const activePrefixResult = await resolveInvoicePrefix({
    supabase, factoryId: profile.factory_id, category: "broker_invoice", role: profile.role,
  });
  const generatedDispatchNo = activePrefixResult.ok && !activePrefixResult.needsApproval
    ? await nextDispatchNo(supabase, profile.factory_id, activePrefixResult.prefix.prefix)
    : "";

  return (
    <DispatchesTable
      initialRows={dispatches.rows}
      isOwner={isOwner}
      creation={{
        brokers: brokers.rows.map(({ id, name }) => ({ id, name })),
        marks: marks.rows.map(({ id, code, name }) => ({ id, code, name })),
        invoiceDate: colomboToday(),
        nextDispatchNo: generatedDispatchNo,
        prefixes,
        dispatchHistory: dispatches.rows.map((sale) => ({
          saleNo: sale.sale_no,
          targetSaleNo: sale.target_sale_no,
          dispatchDate: sale.dispatch_date,
          saleDate: sale.sale_date,
        })),
      }}
    />
  );
}
