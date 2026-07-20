import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { DispatchesTable } from "./dispatches-table";
import { colomboToday, nextDispatchNo } from "./_actions/_shared";

export default async function AuctionSalesPage() {
  const { supabase, profile } = await requirePageAccess("auction-invoices");
  const isOwner = profile.role === "owner";
  const [dispatches, brokers, marks, generatedDispatchNo] = await Promise.all([
    loadListResource({ key: "auction.dispatches" }),
    loadListResource({ key: "auction.brokers" }),
    loadListResource({ key: "auction.marks" }),
    nextDispatchNo(supabase),
  ]);

  if (!dispatches.ok) throw new Error(dispatches.error);
  if (!brokers.ok) throw new Error(brokers.error);
  if (!marks.ok) throw new Error(marks.error);

  return (
    <DispatchesTable
      initialRows={dispatches.rows}
      isOwner={isOwner}
      creation={{
        brokers: brokers.rows.map(({ id, name }) => ({ id, name })),
        marks: marks.rows.map(({ id, code, name }) => ({ id, code, name })),
        invoiceDate: colomboToday(),
        nextDispatchNo: generatedDispatchNo,
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
