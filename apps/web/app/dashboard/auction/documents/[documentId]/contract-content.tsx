import { money } from "@/app/dashboard/auction/format";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirmation-dialog";
import {
  contractRateDifferences,
  contractValidationIssues,
  hasContractRates,
  invoiceMatchKey,
  reconcileValuation,
  repairLegacyContractLines,
  validateContractLine,
  type ParsedContract,
  type ValuationInput,
  type SaleInput,
} from "@tea/api";
import { confirmContract, rejectImport } from "@/app/dashboard/auction/actions";
import { canonicalGrade, gradeAliasMap, saleGroupIds } from "@/app/dashboard/auction/_actions/_shared";
import { loadSaleRevenueCheck } from "@/app/dashboard/auction/_actions/revenue-check";

/** A contract staged before rate parsing existed has no `rates` block. */
const EMPTY_RATES = {
  insurancePerKg: null, publicSaleExPerLot: null, brokeragePct: null, handlingPerKg: null,
  documentationPerLot: null, eplatformPerKg: null, chargesVatPct: null, proceedsVatPct: null,
};
import { formatFourDigitNo } from "@/app/dashboard/auction/sale-number";
import { applyServerListSearch } from "@/lib/list-search-state";
import type { requirePageAccess } from "@/lib/profile";
import { ContractLinesTable, type ContractLineRow } from "./contract-lines-table";

type Ctx = Awaited<ReturnType<typeof requirePageAccess>>;

export async function ContractContent({
  supabase,
  profile,
  saleId,
  importId,
}: {
  supabase: Ctx["supabase"];
  profile: Ctx["profile"];
  saleId: string;
  importId: string;
}) {
  const { data: imp } = await supabase
    .from("doc_imports")
    .select("parsed_json, status, source_filename")
    .eq("id", importId)
    .single();
  if (!imp?.parsed_json) {
    return <p className="text-sm text-stone-500 dark:text-stone-400">Staged import not found.</p>;
  }

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
  const repairedLines = repairLegacyContractLines(rawParsed.lines);
  const parsed: ParsedContract = {
    ...rawParsed,
    lines: repairedLines.map((line) => ({ ...line, grade: canonicalGrade(line.grade, aliases) })),
  };
  const reviewIssues = [...new Set([...parsed.issues, ...contractValidationIssues(parsed.lines)])];

  // The contract is the SOURCE OF TRUTH for what the broker charges: it prints
  // the rate beside every line of the Account Sales stack. If the stored rate
  // card disagrees, every settlement computed from it is wrong — so the
  // difference is put in front of the operator rather than silently applied.
  const { data: saleBroker } = await supabase
    .from("auction_sales")
    .select("broker_id, brokers(name)")
    .eq("id", saleId)
    .maybeSingle();
  const contractBrokerId = saleBroker?.broker_id as string | undefined;
  const contractBrokerName = (saleBroker?.brokers as unknown as { name: string } | null)?.name ?? "this broker";
  const { data: storedRateRows } = contractBrokerId
    ? await supabase
        .from("broker_rates")
        .select("insurance_per_kg, public_sale_ex_per_lot, brokerage_pct, handling_per_kg, documentation_per_lot, eplatform_per_kg, charges_vat_pct, proceeds_vat_pct, effective_from")
        .eq("broker_id", contractBrokerId)
        .order("effective_from", { ascending: false })
        .limit(1)
    : { data: [] };
  const storedRate = (storedRateRows ?? [])[0] as Record<string, string | number | null> | undefined;
  const parsedRates = parsed.rates ?? EMPTY_RATES;
  const rateDifferences = storedRate
    ? contractRateDifferences(parsedRates, {
        insurancePerKg: storedRate.insurance_per_kg,
        publicSaleExPerLot: storedRate.public_sale_ex_per_lot,
        brokeragePct: storedRate.brokerage_pct,
        handlingPerKg: storedRate.handling_per_kg,
        documentationPerLot: storedRate.documentation_per_lot,
        eplatformPerKg: storedRate.eplatform_per_kg,
        chargesVatPct: storedRate.charges_vat_pct,
        proceedsVatPct: storedRate.proceeds_vat_pct,
      })
    : [];
  // No card yet: confirming this contract will create one from these rates.
  const willCreateRateCard = !storedRate && hasContractRates(parsedRates);
  const confirmed = imp.status === "confirmed";

  const lotById = new Map((lotRows ?? []).map((l) => [l.id as string, l]));
  // A broker's sellers contract only ever prints the bare invoice sequence
  // ("0003"), never the factory's index-cycle prefix ("26I01-0003") — match on
  // the normalized key, not the display string.
  const invoiceToLotId = new Map<string, string>();
  for (const lot of (lotRows ?? []) as { id: string; invoice_no: string | null; lot_invoices?: { invoice_no: string | null }[] | null }[]) {
    if (lot.invoice_no) invoiceToLotId.set(invoiceMatchKey(lot.invoice_no), lot.id);
    for (const invoice of lot.lot_invoices ?? []) {
      if (invoice.invoice_no) invoiceToLotId.set(invoiceMatchKey(invoice.invoice_no), lot.id);
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
    .filter((l) => l.sold !== false && invoiceToLotId.has(invoiceMatchKey(l.invoiceNo)))
    .map((l) => ({ lotId: invoiceToLotId.get(invoiceMatchKey(l.invoiceNo))!, pricePerKg: l.pricePerKg, proceeds: l.proceeds }));
  const unmatchedLines = parsed.lines.filter((line) => !invoiceToLotId.has(invoiceMatchKey(line.invoiceNo)));
  const parsedSoldCount = parsed.lines.filter((line) => line.sold !== false).length;
  const parsedNotSoldCount = parsed.lines.length - parsedSoldCount;
  const canConfirm = reviewIssues.length === 0 && unmatchedLines.length === 0;

  const recon = reconcileValuation(valInputs, saleInputs);
  const reconByLot = new Map(recon.rows.map((r) => [r.lotId, r]));
  const s = recon.summary;
  const hasValuations = valInputs.length > 0;

  const contractLineRows: ContractLineRow[] = parsed.lines.map((l) => {
    const lotId = invoiceToLotId.get(invoiceMatchKey(l.invoiceNo));
    const r = lotId ? reconByLot.get(lotId) : undefined;
    const validation = validateContractLine(l);
    return {
      sold: l.sold !== false,
      status: l.sold !== false ? "Sold" : confirmed ? "Re-print" : "Not sold",
      invoiceNo: l.invoiceNo,
      invoiceMatched: lotId != null,
      buyerName: l.buyerName,
      netWt: l.netWt,
      pricePerKg: l.pricePerKg,
      priceMin: r?.priceMin ?? null,
      priceMax: r?.priceMax ?? null,
      classification: r?.classification ?? "no-valuation",
      proceeds: l.proceeds,
      expectedProceeds: validation.expectedProceeds,
      proceedsVariance: validation.proceedsVariance,
      proceedsMatch: validation.proceedsMatch,
      variance: r?.variance ?? null,
      vatAmount: l.vatAmount,
      onGuarantee: l.onGuarantee,
    };
  });

  const visibleContractLineRows = await applyServerListSearch(supabase, profile, "contract-lines", contractLineRows);

  // Our recomputed revenue for the whole sale against what every confirmed
  // sellers contract printed. Same shared check the sale detail page runs.
  const { data: settlementRows } = await supabase
    .from("settlements").select("net_proceeds").in("sale_id", groupIds);
  const revenueCheck = await loadSaleRevenueCheck(
    supabase,
    profile.factory_id,
    groupIds,
    ((settlementRows ?? []) as { net_proceeds: string | number | null }[])
      .reduce((sum, row) => sum + Number(row.net_proceeds ?? 0), 0),
  );

  return (
    <div className="space-y-6">
      {/* Re-validation against every sellers contract confirmed for this sale.
          It lives here as well as on the sale page because this is the document
          an operator would re-upload to correct a mismatch. */}
      {revenueCheck.status === "mismatch" && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-medium">
            Total revenue is off the sellers contracts by LKR {money(Math.abs(revenueCheck.difference))}
          </p>
          <p className="mt-1 text-xs leading-5">
            This sale computes LKR {money(revenueCheck.computed)}, while the {revenueCheck.documents} confirmed
            contract{revenueCheck.documents === 1 ? "" : "s"} print LKR {money(revenueCheck.printed)}. The contracts
            are the broker&apos;s own figures, so a gap means a line or a charge did not survive ingestion — check the
            unmatched lines below, then re-run the settlement.
          </p>
        </div>
      )}
      {revenueCheck.status === "tallied" && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-400">
          Total revenue tallies with all {revenueCheck.documents} sellers contract{revenueCheck.documents === 1 ? "" : "s"} for this sale — LKR {money(revenueCheck.printed)}.
        </div>
      )}
      {/* Everything reconciles once the broker's own insurance figure replaces
          ours, so every other charge is right. A note, not an error. */}
      {revenueCheck.status === "tallied-on-printed-insurance" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <p className="font-medium">
            Tallies using the broker&apos;s insurance figure — LKR {money(revenueCheck.printed)}
          </p>
          <p className="mt-1 text-xs leading-5">
            The contract charges LKR {money(revenueCheck.printedInsurance)} insurance where this sale calculates
            LKR {money(revenueCheck.computedInsurance)}, a difference of LKR {money(Math.abs(revenueCheck.insuranceDifference))}.
            Every other charge agrees to the cent. The broker insures only some of the lots and its contract does not
            say which, so its figure is the one to trust here — no action needed unless the gap looks wrong to you.
          </p>
        </div>
      )}
      <div>
        <h3 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Reconciliation ② — valuation ↔ sale price</h3>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {parsed.lines.length} contract lines · {parsedSoldCount} sold · {parsedNotSoldCount} not sold · {parsed.lines.length - unmatchedLines.length} matched · prompt {parsed.promptDate ?? "—"}
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
      {reviewIssues.length > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-800 dark:text-amber-400">
          <p className="font-medium">Parse warnings:</p>
          <ul className="ml-4 list-disc">
            {reviewIssues.map((i, idx) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>
        </div>
      )}
      {rateDifferences.length > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <p className="font-medium">
            Broker charges differ from the saved rate card for {contractBrokerName}:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {rateDifferences.map((difference) => (
              <li key={difference.field}>
                {difference.label} — this contract says <strong>{difference.contract}</strong>, the saved card says{" "}
                <strong>{difference.stored}</strong>.
              </li>
            ))}
          </ul>
          <p className="mt-1">
            The contract is the source of truth. Update the rate card to match, then re-confirm, or every settlement
            computed for {contractBrokerName} will use the wrong charges.
          </p>
        </div>
      )}
      {willCreateRateCard && (
        <div className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-300">
          <p className="font-medium">
            {contractBrokerName} has no saved rate card — confirming will create one from this contract:
          </p>
          <p className="mt-1">
            brokerage {parsedRates.brokeragePct ?? 0}%, insurance Rs.{parsedRates.insurancePerKg ?? 0}/kg, handling
            Rs.{parsedRates.handlingPerKg ?? 0}/kg, public sale expenses Rs.{parsedRates.publicSaleExPerLot ?? 0}/lot,
            documentation Rs.{parsedRates.documentationPerLot ?? 0}/lot, e-platform Rs.{parsedRates.eplatformPerKg ?? 0}/kg,
            VAT on charges {parsedRates.chargesVatPct ?? 18}%.
          </p>
        </div>
      )}
      {unmatchedLines.length > 0 && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          <p className="font-medium">Invoice matching required before confirmation:</p>
          <p className="mt-1">
            {unmatchedLines.length} contract line{unmatchedLines.length === 1 ? "" : "s"} could not be matched to a lot in this broker sale:{" "}
            {unmatchedLines.map((line) => formatFourDigitNo(line.invoiceNo)).join(", ")}.
          </p>
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

      <ContractLinesTable rows={visibleContractLineRows} />

      {!confirmed && (
        <div className="flex gap-3">
          <form action={confirmContract.bind(null, importId, saleId)}>
            <SubmitButton
              pendingText="Saving…"
              disabled={!canConfirm}
              title={!canConfirm ? "Resolve the contract validation and invoice-matching warnings before confirming." : undefined}
              variant="primary"
              className="rounded-md px-4 py-2 text-sm"
            >
              Confirm — record {saleInputs.length} sold; mark {parsed.lines.filter((line) => line.sold === false && invoiceToLotId.has(invoiceMatchKey(line.invoiceNo))).length} re-print
            </SubmitButton>
          </form>
          <form action={rejectImport.bind(null, importId, saleId)}>
            <ConfirmSubmitButton
              title="Reject Sellers Contract?"
              description="This discards the staged contract only. The sale, Dispatch Invoice, and lots will remain unchanged."
              confirmLabel="Reject contract"
              className="rounded-md border border-stone-300 dark:border-stone-600 px-4 py-2 text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              Reject
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
