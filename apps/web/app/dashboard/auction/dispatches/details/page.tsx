import { redirect } from "next/navigation";
import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { NewBundledDispatchBootstrap } from "./new-bundled-dispatch-bootstrap";

/**
 * Fallback landing spot for the "Dispatch Details" nav entry: redirects to
 * the latest physical dispatch if any exist. Only when a factory has zero
 * physical dispatches ever does this show the bootstrap creation form below
 * — the one place a physical dispatch can be created without an existing
 * record to start from.
 */
export default async function DispatchDetailsPage() {
  const { supabase, profile } = await requirePageAccess("auction-dispatch-details");
  const { data: latestDispatch } = await supabase
    .from("auction_bundled_dispatches")
    .select("id")
    .order("dispatch_date_from", { ascending: false })
    .order("dispatch_no", { ascending: false })
    .limit(1);
  const dispatchId = latestDispatch?.[0]?.id as string | undefined;
  if (dispatchId) redirect(`/dashboard/auction/dispatches/${dispatchId}`);

  const [eligibleInvoices, warehouses] = await Promise.all([
    loadListResource({ key: "auction.eligible-broker-invoices" }),
    loadListResource({ key: "auction.warehouses" }),
  ]);
  if (!eligibleInvoices.ok) throw new Error(eligibleInvoices.error);
  if (!warehouses.ok) throw new Error(warehouses.error);

  return (
    <NewBundledDispatchBootstrap
      eligibleInvoices={eligibleInvoices.rows}
      warehouses={warehouses.rows}
      canCreate={profile.role === "owner" || profile.role === "manager"}
    />
  );
}
