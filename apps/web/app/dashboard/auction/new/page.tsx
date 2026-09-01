import { redirect } from "next/navigation";
import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { colomboToday, nextDispatchNo } from "../_actions/_shared";
import { resolveInvoicePrefix } from "../invoice-number";
import { NewBrokerInvoiceBootstrap } from "./new-broker-invoice-bootstrap";

/**
 * Fallback landing spot for "Dispatch Invoice Details" nav/redirects: if any broker
 * invoice exists, go straight to the latest one (same target the nav's
 * redirect-to-latest logic in dashboard/layout.tsx resolves). Only when a
 * factory has zero dispatch invoices ever does this show the bootstrap
 * creation form below — the one place a dispatch invoice can be created
 * without an existing record to start from.
 */
export default async function NewBrokerInvoicePage() {
  const { supabase, profile } = await requirePageAccess("auction-invoice-new");

  const { data: latest } = await supabase
    .from("auction_sales")
    .select("id")
    .eq("sale_kind", "dispatch")
    .order("dispatch_date", { ascending: false })
    .order("sale_no", { ascending: false })
    .limit(1);
  const latestId = latest?.[0]?.id as string | undefined;
  if (latestId) redirect(`/dashboard/auction/${latestId}`);

  const [brokers, marks, { data: prefixRows }] = await Promise.all([
    loadListResource({ key: "auction.brokers" }),
    loadListResource({ key: "auction.marks" }),
    supabase.from("invoice_number_prefixes").select("id, prefix, active").eq("category", "broker_invoice").order("prefix"),
  ]);
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
    <NewBrokerInvoiceBootstrap
      brokers={brokers.rows.map(({ id, name }) => ({ id, name }))}
      marks={marks.rows.map(({ id, code, name }) => ({ id, code, name }))}
      invoiceDate={colomboToday()}
      nextDispatchNo={generatedDispatchNo}
      prefixes={prefixes}
    />
  );
}
