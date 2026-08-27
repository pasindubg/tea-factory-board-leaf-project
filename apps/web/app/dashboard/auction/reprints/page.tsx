import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { colomboToday } from "../_actions/_shared";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";
import { ReprintOverviewTable, type HistoricReprintCandidate } from "./reprint-overview-table";

export default async function ReprintOverviewPage() {
  const { supabase, profile } = await requirePageAccess("auction-reprints");
  const isOwner = profile.role === "owner";
  const reprintResult = await loadListResource({ key: "auction.reprint-overview" });
  if (!reprintResult.ok) throw new Error(reprintResult.error);

  // Broker, mark and grade are picked through server-querying LOV comboboxes,
  // so none of their option lists is preloaded here. Grades are the exception
  // the Invoice Overview makes too: the entry form needs each grade's
  // configured sample weight locally to auto-fill it.
  const [{ data: candidates, error: candidateError }, { data: grades, error: gradeError }] = await Promise.all([
    isOwner
      ? supabase
        .from("auction_lots")
        .select("id, invoice_no, grade, sample_allowance, lot_invoices(invoice_no), auction_sales(sale_no, target_sale_no, brokers(name))")
        .eq("factory_id", profile.factory_id)
        .not("invoice_no", "is", null)
        .is("reprint_source_lot_id", null)
        .in("state", ["acknowledged", "valued"])
        .order("created_at")
      : { data: [], error: null },
    supabase
      .from("auction_grades")
      .select("code, name, sample_weight, default_kg_per_bag")
      .eq("active", true)
      .order("sort_order")
      .order("code"),
  ]);
  if (candidateError) throw new Error(`Could not load historic re-print candidates: ${candidateError.message}`);
  if (gradeError) throw new Error(`Could not load re-print reference data: ${gradeError.message}`);

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
          Re-prints outstanding from before this system was in use are entered here; a later acknowledgement
          listing one of those invoices links to it as a re-print child instead of reporting it as not-acknowledged.
        </p>
      </div>
      <ReprintOverviewTable
        rows={reprintResult.rows}
        historicCandidates={historicCandidates}
        canRegisterHistoric={isOwner}
        today={colomboToday()}
        grades={(grades ?? []).map((grade) => {
          const row = grade as { sample_weight?: string | number | null; default_kg_per_bag?: string | number | null };
          return {
            code: grade.code as string,
            name: grade.name as string,
            sampleWeight: row.sample_weight == null ? null : Number(row.sample_weight),
            defaultKgPerBag: row.default_kg_per_bag == null ? null : Number(row.default_kg_per_bag),
          };
        })}
      />
    </div>
  );
}
