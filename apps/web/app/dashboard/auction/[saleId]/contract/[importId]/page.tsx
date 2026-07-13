import Link from "next/link";
import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import {
  reconcileValuation,
  type ParsedContract,
  type ValuationInput,
  type SaleInput,
} from "@tea/api";
import { confirmContract, rejectImport } from "../../../actions";
import { canonicalGrade, gradeAliasMap, saleGroupIds } from "../../../_actions/_shared";
import { formatFourDigitNo, saleNoKey } from "../../../sale-number";
import { ContractLinesTable, type ContractLineRow } from "./contract-lines-table";

export default async function ContractReviewPage({
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
  if (!imp || imp.sale_id !== saleId || imp.doc_type !== "contract" || !imp.parsed_json) {
    return (
      <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-8 text-center text-stone-500 dark:text-stone-400">
        Staged import not found.{" "}
        <Link href={fallback} className="text-green-700 dark:text-green-400 hover:underline">
          Back to sale
        </Link>
      </div>
    );
  }

  const { data: sale } = await supabase.from("auction_sales").select("sale_no, target_sale_no").eq("id", saleId).single();
  const detail = `/dashboard/auction/sales/${encodeURIComponent(saleNoKey((sale?.target_sale_no as string | null) || (sale?.sale_no as string | null)) || saleId)}`;
  // The contract covers the broker's whole sale — match against lots on every
  // dispatch in this sale's group.
  const groupIds = await saleGroupIds(supabase, profile.factory_id, saleId);
  const { data: lotRows } = await supabase
    .from("auction_lots")
    .select("id, invoice_no, grade, net_wt, lot_invoices(invoice_no)")
    .in("sale_id", groupIds);
  const lotIds = (lotRows ?? []).map((l) => l.id as string);
  const { data: valRows } = await supabase
    .from("valuations")
    .select("lot_id, price_min, price_max, projected_proceeds")
    .in("lot_id", lotIds.length > 0 ? lotIds : ["00000000-0000-0000-0000-000000000000"]);

  const aliases = await gradeAliasMap(supabase, profile.factory_id);
  const rawParsed = imp.parsed_json as ParsedContract;
  const parsed: ParsedContract = {
    ...rawParsed,
    lines: rawParsed.lines.map((line) => ({ ...line, grade: canonicalGrade(line.grade, aliases) })),
  };
  const confirmed = imp.status === "confirmed";

  const lotById = new Map((lotRows ?? []).map((l) => [l.id as string, l]));
  const invoiceToLotId = new Map<string, string>();
  for (const lot of (lotRows ?? []) as { id: string; invoice_no: string | null; lot_invoices?: { invoice_no: string | null }[] | null }[]) {
    if (lot.invoice_no) invoiceToLotId.set(formatFourDigitNo(lot.invoice_no), lot.id);
    for (const invoice of lot.lot_invoices ?? []) {
      if (invoice.invoice_no) invoiceToLotId.set(formatFourDigitNo(invoice.invoice_no), lot.id);
    }
  }

  const valInputs: ValuationInput[] = (valRows ?? [])
    .filter((v) => lotById.has(v.lot_id as string))
    .map((v) => {
      const lot = lotById.get(v.lot_id as string)!;
      return {
        lotId: v.lot_id as string,
        invoiceNo: formatFourDigitNo(lot.invoice_no as string),
        grade: lot.grade as string,
        netWt: Number(lot.net_wt),
        priceMin: v.price_min == null ? null : Number(v.price_min),
        priceMax: v.price_max == null ? null : Number(v.price_max),
        projectedProceeds: v.projected_proceeds == null ? null : Number(v.projected_proceeds),
      };
    });
  const saleInputs: SaleInput[] = parsed.lines
    .filter((l) => l.sold !== false && invoiceToLotId.has(formatFourDigitNo(l.invoiceNo)))
    .map((l) => ({ lotId: invoiceToLotId.get(formatFourDigitNo(l.invoiceNo))!, pricePerKg: l.pricePerKg, proceeds: l.proceeds }));

  const recon = reconcileValuation(valInputs, saleInputs);
  const reconByLot = new Map(recon.rows.map((r) => [r.lotId, r]));
  const s = recon.summary;
  const hasValuations = valInputs.length > 0;

  const contractLineRows: ContractLineRow[] = parsed.lines.map((l) => {
    const lotId = invoiceToLotId.get(formatFourDigitNo(l.invoiceNo));
    const r = lotId ? reconByLot.get(lotId) : undefined;
    return {
      sold: l.sold !== false,
      status: l.sold !== false ? "Sold" : confirmed ? "Re-print" : "Not sold",
      invoiceNo: l.invoiceNo,
      buyerName: l.buyerName,
      pricePerKg: l.pricePerKg,
      priceMin: r?.priceMin ?? null,
      priceMax: r?.priceMax ?? null,
      classification: r?.classification ?? "no-valuation",
      proceeds: l.proceeds,
      variance: r?.variance ?? null,
      vatAmount: l.vatAmount,
      onGuarantee: l.onGuarantee,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href={detail} className="text-sm text-green-700 dark:text-green-400 hover:underline">
          ← Sale {(sale?.target_sale_no as string | null) ?? (sale?.sale_no as string | null) ?? ""}
        </Link>
        <h2 className="mt-1 text-xl font-semibold">Reconciliation ② — valuation ↔ sale price</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {imp.source_filename ?? "contract.pdf"} · {parsed.lines.length} contract lines · {saleInputs.length} sold · prompt {parsed.promptDate ?? "—"}
        </p>
      </div>

      {confirmed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-green-50 dark:bg-green-950 px-3 py-2 text-sm text-green-800 dark:text-green-400">
          <span>Sale lines confirmed and applied.</span>
          <form action={confirmContract.bind(null, importId, saleId)}>
            <SubmitButton
              pendingText="Re-running…"
              className="rounded-md border border-green-600 dark:border-green-500 px-3 py-1 text-xs font-medium text-green-800 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900"
            >
              Re-run settlement
            </SubmitButton>
          </form>
        </div>
      )}
      {!hasValuations && (
        <p className="rounded-md bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-800 dark:text-amber-400">
          No valuations recorded yet — upload the Valuation Report first to compare against it. You can still
          confirm the sale prices.
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

      {hasValuations && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-green-100 dark:bg-green-900 px-3 py-1 text-sm text-green-800 dark:text-green-400">Above: <strong>{s.above}</strong></span>
          <span className="rounded-full bg-blue-100 dark:bg-blue-900 px-3 py-1 text-sm text-blue-800 dark:text-blue-400">Within: <strong>{s.within}</strong></span>
          <span className="rounded-full bg-red-100 dark:bg-red-900 px-3 py-1 text-sm text-red-800 dark:text-red-400">Below: <strong>{s.below}</strong></span>
          <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-3 py-1 text-sm text-stone-700 dark:text-stone-300">
            Valued avg {s.valuationAvg.toLocaleString()} → realised {s.realisedAvg.toLocaleString()} /kg
          </span>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${s.premiumPct >= 0 ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400" : "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-400"}`}>
            {s.premiumPct >= 0 ? "+" : ""}
            {s.premiumPct}% vs valuation
          </span>
        </div>
      )}

      <ContractLinesTable rows={contractLineRows} />

      {!confirmed && (
        <div className="flex gap-3">
          <form action={confirmContract.bind(null, importId, saleId)}>
            <SubmitButton
              pendingText="Saving…"
              className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
            >
              Confirm — record {saleInputs.length} sold; mark {parsed.lines.filter((line) => line.sold === false).length} re-print
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
