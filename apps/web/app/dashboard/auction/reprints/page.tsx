import { requireModuleAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";
import { ReprintOverviewTable, type HistoricReprintCandidate } from "./reprint-overview-table";

export default async function ReprintOverviewPage() {
  const { supabase, profile } = await requireModuleAccess("auction");
  const reprintResult = await loadListResource({ key: "auction.reprint-overview" });
  if (!reprintResult.ok) throw new Error(reprintResult.error);

  const { data: candidates, error: candidateError } = profile.role === "owner"
    ? await supabase
      .from("auction_lots")
      .select("id, invoice_no, grade, sample_allowance, lot_invoices(invoice_no), auction_sales(sale_no, target_sale_no, brokers(name))")
      .eq("factory_id", profile.factory_id)
      .not("invoice_no", "is", null)
      .is("reprint_source_lot_id", null)
      .in("state", ["acknowledged", "catalogued", "valued", "withdrawn"])
      .order("created_at")
    : { data: [], error: null };
  if (candidateError) throw new Error(`Could not load historic re-print candidates: ${candidateError.message}`);

  const historicCandidates: HistoricReprintCandidate[] = (candidates ?? []).map((lot) => {
    const invoiceRows = (lot.lot_invoices as unknown as { invoice_no: string | null }[] | null) ?? [];
    const invoiceNo = invoiceRows.map((invoice) => formatFourDigitNo(invoice.invoice_no)).filter(Boolean).join(", ") || formatFourDigitNo(lot.invoice_no as string | null);
    const brokerInvoice = lot.auction_sales as unknown as { sale_no: string | null; target_sale_no: string | null; brokers: { name: string } | null } | null;
    const broker = brokerInvoice?.brokers?.name ?? "—";
    const saleNo = formatSaleNo(brokerInvoice?.target_sale_no ?? null) || "—";
    return {
      id: lot.id as string,
      label: `${invoiceNo} · ${broker} · Sale ${saleNo} · ${lot.grade ?? "—"}`,
      existingSampleKg: Number(lot.sample_allowance ?? 0),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Re-print Overview</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Broker-invoice lots marked as re-print, with original lot attributes and forward re-print counts.
        </p>
      </div>
      <ReprintOverviewTable
        rows={reprintResult.rows}
        historicCandidates={historicCandidates}
        canRegisterHistoric={profile.role === "owner"}
      />
    </div>
  );
}
