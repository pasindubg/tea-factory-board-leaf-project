import Link from "next/link";
import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import type { ParsedValuation } from "@tea/api";
import { confirmValuation, rejectImport } from "../../../actions";
import { canonicalGrade, gradeAliasMap } from "../../../_actions/_shared";
import { formatFourDigitNo, formatSaleNo, saleNoKey } from "../../../sale-number";
import { ValuationTable, type ValuationTableRow } from "./valuation-table";

export default async function ValuationReviewPage({
  params,
}: {
  params: Promise<{ saleId: string; importId: string }>;
}) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const { saleId, importId } = await params;
  const fallback = "/dashboard/auction/sales";

  const { data: imp } = await supabase
    .from("doc_imports")
    .select("parsed_json, status, source_filename, sale_id, doc_type")
    .eq("id", importId)
    .single();
  if (!imp || imp.sale_id !== saleId || imp.doc_type !== "valuation" || !imp.parsed_json) {
    return (
      <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-8 text-center text-stone-500 dark:text-stone-400">
        Staged import not found.{" "}
        <Link href={fallback} className="text-green-700 dark:text-green-400 hover:underline">
          Back to sale
        </Link>
      </div>
    );
  }

  const { data: sale } = await supabase.from("auction_sales").select("sale_no, target_sale_no, broker_id").eq("id", saleId).single();
  const detail = `/dashboard/auction/sales/${encodeURIComponent(saleNoKey((sale?.target_sale_no as string | null) || (sale?.sale_no as string | null)) || saleId)}`;
  // Match broker-wide: a Not Valued invoice may reappear in a later sale's
  // valuation while remaining attached to its original Broker Invoice.
  const { data: brokerInvoices } = await supabase
    .from("auction_sales")
    .select("id")
    .eq("factory_id", profile.factory_id)
    .eq("broker_id", sale?.broker_id as string);
  const brokerInvoiceIds = (brokerInvoices ?? []).map((invoice) => invoice.id as string);
  const { data: lotRows } = brokerInvoiceIds.length > 0
    ? await supabase.from("auction_lots").select("invoice_no, provisional_sale_no, final_sale_no, lot_invoices(invoice_no)").in("sale_id", brokerInvoiceIds)
    : { data: [] };
  const known = new Map<string, { provisionalSaleNo: string | null; finalSaleNo: string | null }>();
  for (const lot of (lotRows ?? []) as { invoice_no: string | null; provisional_sale_no: string | null; final_sale_no: string | null; lot_invoices?: { invoice_no: string | null }[] | null }[]) {
    const assignment = { provisionalSaleNo: lot.provisional_sale_no, finalSaleNo: lot.final_sale_no };
    if (lot.invoice_no) known.set(formatFourDigitNo(lot.invoice_no), assignment);
    for (const invoice of lot.lot_invoices ?? []) {
      if (invoice.invoice_no) known.set(formatFourDigitNo(invoice.invoice_no), assignment);
    }
  }

  const aliases = await gradeAliasMap(supabase, profile.factory_id);
  const rawParsed = imp.parsed_json as ParsedValuation;
  const parsed: ParsedValuation = {
    ...rawParsed,
    lots: rawParsed.lots.map((lot) => ({ ...lot, grade: canonicalGrade(lot.grade, aliases) })),
  };
  const confirmed = imp.status === "confirmed";
  const reportSaleNo = formatSaleNo(parsed.saleNo);
  const matched = parsed.lots.filter((l) => known.has(formatFourDigitNo(l.invoiceNo))).length;
  const tableRows: ValuationTableRow[] = parsed.lots.map((l) => ({
    ...(() => {
      const assignment = known.get(formatFourDigitNo(l.invoiceNo));
      const currentSaleNo = formatSaleNo(assignment?.finalSaleNo ?? assignment?.provisionalSaleNo);
      return { currentSaleNo, outcome: assignment ? (saleNoKey(currentSaleNo) === saleNoKey(reportSaleNo) ? "Confirm sale" : `Move to ${reportSaleNo}`) : "No invoice" };
    })(),
    invoiceNo: l.invoiceNo,
    lotNo: l.lotNo,
    grade: l.grade,
    netWt: l.netWt,
    priceMin: l.priceMin,
    priceMax: l.priceMax,
    projectedProceeds: l.projectedProceeds,
    tastingNote: l.tastingNote,
    matched: known.has(formatFourDigitNo(l.invoiceNo)),
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={detail} className="text-sm text-green-700 dark:text-green-400 hover:underline">
          ← Sale {formatSaleNo((sale?.target_sale_no as string | null) ?? (sale?.sale_no as string | null))}
        </Link>
        <h2 className="mt-1 text-xl font-semibold">Valuation review</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {imp.source_filename ?? "valuation.pdf"} · {parsed.lots.length} lots · {matched} match an acknowledged lot
        </p>
      </div>

      {confirmed && (
        <p className="rounded-md bg-green-50 dark:bg-green-950 px-3 py-2 text-sm text-green-800 dark:text-green-400">
          Valuations confirmed and applied.
        </p>
      )}
      {parsed.issues.length > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-800 dark:text-amber-400">
          <p className="font-medium">Parse warnings:</p>
          <ul className="ml-4 list-disc">
            {parsed.issues.map((i, idx) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <ValuationTable rows={tableRows} />

      {!confirmed && (
        <div className="flex gap-3">
          <form action={confirmValuation.bind(null, importId, saleId)}>
            <SubmitButton
              pendingText="Saving…"
              className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
            >
              Confirm — record {matched} valuation(s)
            </SubmitButton>
          </form>
          <form action={rejectImport.bind(null, importId, saleId)}>
            <SubmitButton
              pendingText="…"
              className="rounded-md border border-stone-300 dark:border-stone-600 px-4 py-2 text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              Reject
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
