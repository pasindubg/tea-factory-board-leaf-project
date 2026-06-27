import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import {
  reconcileValuation,
  type ParsedContract,
  type ValuationInput,
  type SaleInput,
  type ValClass,
} from "@tea/api";
import { confirmContract, rejectImport } from "../../../actions";

const CLASS_STYLE: Record<ValClass, string> = {
  above: "bg-green-100 text-green-800",
  within: "bg-blue-100 text-blue-800",
  below: "bg-red-100 text-red-800",
  "no-valuation": "bg-stone-100 text-stone-500",
};

export default async function ContractReviewPage({
  params,
}: {
  params: Promise<{ saleId: string; importId: string }>;
}) {
  const { supabase } = await requireModuleAccess("auction");
  const { saleId, importId } = await params;
  const detail = `/dashboard/auction/${saleId}`;

  const { data: imp } = await supabase
    .from("doc_imports")
    .select("parsed_json, status, source_filename, sale_id")
    .eq("id", importId)
    .single();
  if (!imp || imp.sale_id !== saleId || !imp.parsed_json) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500">
        Staged import not found.{" "}
        <a href={detail} className="text-green-700 hover:underline">
          Back to sale
        </a>
      </div>
    );
  }

  const { data: sale } = await supabase.from("auction_sales").select("sale_no").eq("id", saleId).single();
  const { data: lotRows } = await supabase
    .from("auction_lots")
    .select("id, invoice_no, grade, net_wt")
    .eq("sale_id", saleId);
  const lotIds = (lotRows ?? []).map((l) => l.id as string);
  const { data: valRows } = await supabase
    .from("valuations")
    .select("lot_id, price_min, price_max, projected_proceeds")
    .in("lot_id", lotIds.length > 0 ? lotIds : ["00000000-0000-0000-0000-000000000000"]);

  const parsed = imp.parsed_json as ParsedContract;
  const confirmed = imp.status === "confirmed";

  const lotById = new Map((lotRows ?? []).map((l) => [l.id as string, l]));
  const invoiceToLotId = new Map((lotRows ?? []).map((l) => [l.invoice_no as string, l.id as string]));

  const valInputs: ValuationInput[] = (valRows ?? [])
    .filter((v) => lotById.has(v.lot_id as string))
    .map((v) => {
      const lot = lotById.get(v.lot_id as string)!;
      return {
        lotId: v.lot_id as string,
        invoiceNo: lot.invoice_no as string,
        grade: lot.grade as string,
        netWt: Number(lot.net_wt),
        priceMin: v.price_min == null ? null : Number(v.price_min),
        priceMax: v.price_max == null ? null : Number(v.price_max),
        projectedProceeds: v.projected_proceeds == null ? null : Number(v.projected_proceeds),
      };
    });
  const saleInputs: SaleInput[] = parsed.lines
    .filter((l) => invoiceToLotId.has(l.invoiceNo))
    .map((l) => ({ lotId: invoiceToLotId.get(l.invoiceNo)!, pricePerKg: l.pricePerKg, proceeds: l.proceeds }));

  const recon = reconcileValuation(valInputs, saleInputs);
  const reconByLot = new Map(recon.rows.map((r) => [r.lotId, r]));
  const s = recon.summary;
  const hasValuations = valInputs.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <a href={detail} className="text-sm text-green-700 hover:underline">
          ← Sale {sale?.sale_no ?? ""}
        </a>
        <h2 className="mt-1 text-xl font-semibold">Reconciliation ② — valuation ↔ sale price</h2>
        <p className="text-sm text-stone-500">
          {imp.source_filename ?? "contract.pdf"} · {parsed.lines.length} sale lines · prompt {parsed.promptDate ?? "—"}
        </p>
      </div>

      {confirmed && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">Sale lines confirmed and applied.</p>}
      {!hasValuations && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No valuations recorded yet — upload the Valuation Report first to compare against it. You can still
          confirm the sale prices.
        </p>
      )}
      {parsed.issues.length > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
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
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">Above: <strong>{s.above}</strong></span>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800">Within: <strong>{s.within}</strong></span>
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-800">Below: <strong>{s.below}</strong></span>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700">
            Valued avg {s.valuationAvg.toLocaleString()} → realised {s.realisedAvg.toLocaleString()} /kg
          </span>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${s.premiumPct >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {s.premiumPct >= 0 ? "+" : ""}
            {s.premiumPct}% vs valuation
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="px-3 py-3">Invoice</th>
              <th className="px-3 py-3">Buyer</th>
              <th className="px-3 py-3 text-right">Price/kg</th>
              <th className="px-3 py-3">Valuation /kg</th>
              <th className="px-3 py-3">vs range</th>
              <th className="px-3 py-3 text-right">Proceeds</th>
              <th className="px-3 py-3 text-right">Δ vs projected</th>
              <th className="px-3 py-3">VAT</th>
            </tr>
          </thead>
          <tbody>
            {parsed.lines.map((l) => {
              const lotId = invoiceToLotId.get(l.invoiceNo);
              const r = lotId ? reconByLot.get(lotId) : undefined;
              const cls = r?.classification ?? "no-valuation";
              return (
                <tr key={l.invoiceNo} className="border-b border-stone-100 last:border-0">
                  <td className="px-3 py-2 font-medium">{l.invoiceNo}</td>
                  <td className="px-3 py-2 text-xs">{l.buyerName}</td>
                  <td className="px-3 py-2 text-right">{l.pricePerKg.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    {r && r.priceMin != null
                      ? r.priceMin === r.priceMax
                        ? r.priceMin.toFixed(0)
                        : `${r.priceMin}–${r.priceMax}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${CLASS_STYLE[cls]}`}>{cls}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{l.proceeds.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    {r?.variance == null ? "—" : `${r.variance > 0 ? "+" : ""}${r.variance.toLocaleString()}`}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {l.vatAmount.toLocaleString()}
                    {l.onGuarantee && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">guar.</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!confirmed && (
        <div className="flex gap-3">
          <form action={confirmContract.bind(null, importId, saleId)}>
            <SubmitButton
              pendingText="Saving…"
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
            >
              Confirm — record {saleInputs.length} sale line(s)
            </SubmitButton>
          </form>
          <form action={rejectImport.bind(null, importId, saleId)}>
            <SubmitButton
              pendingText="…"
              className="rounded-md border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              Reject
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
