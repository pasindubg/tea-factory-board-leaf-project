import { loadListResource } from "@/lib/list-resource-registry";
import { requireModuleAccess } from "@/lib/profile";
import { DispatchList } from "./dispatch-list";

export default async function DispatchOverviewPage() {
  const { profile } = await requireModuleAccess("auction");
  const [dispatches, eligibleInvoices, warehouses] = await Promise.all([
    loadListResource({ key: "auction.physical-dispatches" }),
    loadListResource({ key: "auction.eligible-broker-invoices" }),
    loadListResource({ key: "auction.warehouses" }),
  ]);

  if (!dispatches.ok) throw new Error(dispatches.error);
  if (!eligibleInvoices.ok) throw new Error(eligibleInvoices.error);
  if (!warehouses.ok) throw new Error(warehouses.error);

  return (
    <DispatchList
      rows={dispatches.rows}
      eligibleInvoices={eligibleInvoices.rows}
      warehouses={warehouses.rows}
      canCreate={profile.role === "owner" || profile.role === "manager"}
    />
  );
}
